import XCTest

final class WidgetSnapshotTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_792_636_200)
    private func object() throws -> [String: Any] {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "snapshot-v1", withExtension: "json"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }
    private func decode(_ object: [String: Any]) throws -> WidgetSnapshot {
        try WidgetSnapshot.decode(JSONSerialization.data(withJSONObject: object), now: now)
    }
    func testFixtureSelectsChosenLaterDeparture() throws {
        let snapshot = try decode(object())
        let state = WidgetState.resolve(snapshot, at: now)
        XCTAssertEqual(state.departure?.id, "train-2")
        XCTAssertEqual(state.leaveAt?.timeIntervalSince1970, 1_792_637_220)
        XCTAssertEqual(state.status, .ready)
    }
    func testNoExtraBoardingBufferIsSubtracted() throws {
        let snapshot = try decode(object())
        let state = WidgetState.resolve(snapshot, at: now)
        XCTAssertEqual(state.departure!.date.timeIntervalSince(state.leaveAt!), (8 + 3) * 60)
    }
    func testWalkingExpiryDisablesStayEstimateAtExactBoundary() throws {
        let snapshot = try decode(object())
        let state = WidgetState.resolve(snapshot, at: Date(timeIntervalSince1970: snapshot.walkingValidUntil! / 1000))
        XCTAssertNil(state.leaveAt)
        XCTAssertTrue(state.walkingExpired)
        XCTAssertEqual(state.status, .ready)
    }
    func testTimetableExpiryStopsDepartureAtExactBoundary() throws {
        let snapshot = try decode(object())
        let state = WidgetState.resolve(snapshot, at: Date(timeIntervalSince1970: snapshot.timetableValidUntil / 1000))
        XCTAssertEqual(state.status, .expired)
        XCTAssertNil(state.departure)
    }
    func testDepartedSelectionFallsBackToNextAndThenAllDeparted() throws {
        let snapshot = try decode(object())
        XCTAssertEqual(WidgetState.resolve(snapshot, at: snapshot.departures[1].date).departure?.id, "train-3")
        XCTAssertEqual(WidgetState.resolve(snapshot, at: snapshot.departures[2].date).status, .departed)
    }
    func testTimelineContainsEveryBoundary() throws {
        let snapshot = try decode(object())
        let dates = WidgetState.timelineDates(snapshot, now: now)
        XCTAssertEqual(dates.first, now)
        XCTAssertTrue(dates.contains(snapshot.departures[1].date))
        XCTAssertTrue(dates.contains(Date(timeIntervalSince1970: snapshot.walkingValidUntil! / 1000)))
        XCTAssertTrue(dates.contains(Date(timeIntervalSince1970: snapshot.timetableValidUntil / 1000)))
        XCTAssertTrue(dates.contains(snapshot.departures[1].date.addingTimeInterval(-11 * 60)))
        XCTAssertEqual(dates, Array(Set(dates)).sorted())
    }
    func testAfterMidnightDisplayKeepsServiceDayAnd24HourNotation() throws {
        var data = try object()
        data["departures"] = [["id": "night", "departureAt": 1_792_683_600_000.0, "time": "24:40", "destination": "京都", "trainType": NSNull(), "platform": NSNull()]]
        data["selectedDepartureId"] = NSNull()
        let snapshot = try decode(data)
        XCTAssertEqual(snapshot.serviceDate, "2026-10-22")
        XCTAssertEqual(snapshot.departures.first?.time, "24:40")
    }
    func testRejectsUnknownKeysAndOversizePayload() throws {
        var data = try object(); data["latitude"] = 34.8
        XCTAssertThrowsError(try decode(data))
        XCTAssertThrowsError(try WidgetSnapshot.decode(Data(repeating: 32, count: 32769), now: now))
    }
    func testRejectsUnknownDepartureKeysAndDuplicateIDs() throws {
        var data = try object()
        var rows = try XCTUnwrap(data["departures"] as? [[String: Any]])
        rows[0]["location"] = "secret"; data["departures"] = rows
        XCTAssertThrowsError(try decode(data))
        rows[0].removeValue(forKey: "location"); rows[1]["id"] = rows[0]["id"]; data["departures"] = rows
        XCTAssertThrowsError(try decode(data))
    }
    func testRejectsInvalidDateMissingKeyAndTooManyTrains() throws {
        var data = try object(); data["serviceDate"] = "2026-02-30"
        XCTAssertThrowsError(try decode(data))
        data = try object(); data.removeValue(forKey: "walkMinutes")
        XCTAssertThrowsError(try decode(data))
        data = try object(); data["departures"] = Array(repeating: (data["departures"] as! [[String: Any]])[0], count: 6)
        XCTAssertThrowsError(try decode(data))
    }
    func testRejectsNegativeWalkAndFutureSnapshot() throws {
        var data = try object(); data["walkMinutes"] = -1
        XCTAssertThrowsError(try decode(data))
        data = try object(); data["generatedAt"] = now.timeIntervalSince1970 * 1000 + 120_000
        XCTAssertThrowsError(try decode(data))
    }
    func testMissingWalkingDataIsAllowedButCannotShowStay() throws {
        var data = try object(); data["walkMinutes"] = NSNull(); data["walkingValidUntil"] = NSNull()
        XCTAssertNil(WidgetState.resolve(try decode(data), at: now).leaveAt)
    }
    func testTrustedOriginChecksProtocolPortAndCredentials() throws {
        let configured = try XCTUnwrap(TrustedOrigin.configuredURL("https://example.test/app"))
        XCTAssertTrue(TrustedOrigin.matches(URL(string: "https://example.test/other?test=1"), configured: configured))
        XCTAssertFalse(TrustedOrigin.matches(URL(string: "https://evil.test"), configured: configured))
        XCTAssertFalse(TrustedOrigin.matches(URL(string: "https://example.test:444/"), configured: configured))
        XCTAssertFalse(TrustedOrigin.matches(URL(string: "http://example.test/"), configured: configured))
        XCTAssertNil(TrustedOrigin.configuredURL("https://user:pass@example.test"))
        XCTAssertNil(TrustedOrigin.configuredURL("https://example.test/?secret=abc"))
        XCTAssertNil(TrustedOrigin.configuredURL("javascript:alert(1)"))
    }
    func testBackgroundUpdatePreservesTimetableGenerationAndSetsRouteTime() throws {
        let snapshot = try decode(object())
        let updated = snapshot.replacingWalking(minutes: 5, validUntil: 1_792_636_600_000, updatedAt: 1_792_636_300_000)
        XCTAssertEqual(updated.generatedAt, snapshot.generatedAt)
        XCTAssertEqual(updated.routeUpdatedAt, 1_792_636_300_000)
        XCTAssertEqual(updated.walkMinutes, 5)
        XCTAssertEqual(updated.routingTarget, snapshot.routingTarget)
    }
    func testWalkingResponseUsesDurationAndDistanceConservatively() throws {
        let data = walkingResponse()
        XCTAssertEqual(try WalkingUpdate.parse(data, entranceID: "east", speedKmh: 4.5, origin: (34.8, 135.5), now: now).minutes, 10)
        XCTAssertEqual(try WalkingUpdate.parse(data, entranceID: "east", speedKmh: 3, origin: (34.8, 135.5), now: now).minutes, 15)
        XCTAssertThrowsError(try WalkingUpdate.parse(data, entranceID: "west", speedKmh: 4.5, origin: (34.8, 135.5), now: now))
    }
    func testWalkingResponseRejectsUnverifiedConnector() {
        XCTAssertThrowsError(try WalkingUpdate.parse(walkingResponse(snap: "31"), entranceID: "east", speedKmh: 4.5, origin: (34.8, 135.5), now: now))
        XCTAssertThrowsError(try WalkingUpdate.parse(walkingResponse(distance: "true"), entranceID: "east", speedKmh: 4.5, origin: (34.8, 135.5), now: now))
    }
    func testWalkingResponseRejectsDifferentOriginAndOldOrFutureRoute() {
        XCTAssertThrowsError(try WalkingUpdate.parse(walkingResponse(), entranceID: "east", speedKmh: 4.5, origin: (34.9, 135.5), now: now))
        XCTAssertThrowsError(try WalkingUpdate.parse(walkingResponse(fetchedAt: "1792635599999"), entranceID: "east", speedKmh: 4.5, origin: (34.8, 135.5), now: now))
        XCTAssertThrowsError(try WalkingUpdate.parse(walkingResponse(fetchedAt: "1792636230001"), entranceID: "east", speedKmh: 4.5, origin: (34.8, 135.5), now: now))
    }
    private func walkingResponse(snap: String = "10", distance: String = "600", fetchedAt: String = "1792636200000") -> Data {
        Data("{\"kind\":\"route\",\"entranceId\":\"east\",\"distanceMeters\":\(distance),\"durationSeconds\":600,\"snapDistances\":[\(snap),1],\"fetchedAt\":\(fetchedAt),\"origin\":{\"lat\":34.8,\"lon\":135.5}}".utf8)
    }
    func testRoutingTargetIsStrictAndSpeedIsBounded() throws {
        var data = try object(); data["routingTarget"] = ["stationId": "a", "entranceId": "b", "url": "https://evil.test/"]
        XCTAssertThrowsError(try decode(data))
        data = try object(); data["speedKmh"] = 100
        XCTAssertThrowsError(try decode(data))
    }
    func testRejectsDepartureTimeMismatchAndOutOfServiceDay() throws {
        var data = try object()
        var rows = try XCTUnwrap(data["departures"] as? [[String: Any]])
        rows[0]["time"] = "11:51"; data["departures"] = rows
        XCTAssertThrowsError(try decode(data))
        rows[0]["time"] = "47:59"; data["departures"] = rows
        XCTAssertThrowsError(try decode(data))
        data = try object(); data["serviceDate"] = "2026-10-21"
        XCTAssertThrowsError(try decode(data))
        data = try object(); data["timetableValidUntil"] = now.timeIntervalSince1970 * 1000 + 60_000
        XCTAssertThrowsError(try decode(data))
    }
    func testClockRollbackHidesPotentiallyStaleCountdown() throws {
        let snapshot = try decode(object())
        XCTAssertEqual(WidgetState.resolve(snapshot, at: now.addingTimeInterval(-31)).status, .expired)
        XCTAssertNil(WidgetState.resolve(snapshot, at: now.addingTimeInterval(-31)).leaveAt)
    }
    func testCanonicalStoragePreservesExplicitNullsAndRoundTrips() throws {
        var data = try object(); data["routingTarget"] = NSNull(); data["selectedDepartureId"] = NSNull()
        let snapshot = try decode(data)
        let canonical = try snapshot.canonicalData()
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: canonical) as? [String: Any])
        XCTAssertTrue(object["routingTarget"] is NSNull)
        XCTAssertTrue(object["routeUpdatedAt"] is NSNull)
        XCTAssertEqual(try WidgetSnapshot.decode(canonical, now: now), snapshot)
        XCTAssertNil(object["latitude"])
        XCTAssertNil(object["longitude"])
    }
}
