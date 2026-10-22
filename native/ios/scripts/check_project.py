"""Portable structural checks. This is not a Swift compiler or an iOS runtime test."""
from pathlib import Path
import json
import plistlib
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

root = Path(__file__).resolve().parents[1]
project = (root / "Maniau.xcodeproj/project.pbxproj").read_text(encoding="utf-8")
definitions = re.findall(r"^  ([0-9A-F]{24}) =", project, re.M)
assert len(definitions) == len(set(definitions)), "Duplicate project ID"
references = set(re.findall(r"\b[0-9A-F]{24}\b", project))
assert references == set(definitions), "Missing project reference"
for path in re.findall(r'path = "([^"]+)"; sourceTree = SOURCE_ROOT;', project):
    assert (root / path).is_file(), path
for path in root.rglob("*.plist"):
    with path.open("rb") as stream: plistlib.load(stream)
for path in root.rglob("*.entitlements"):
    with path.open("rb") as stream:
        assert plistlib.load(stream)["com.apple.security.application-groups"] == ["$(MANIAU_APP_GROUP)"]
app = plistlib.loads((root / "App/Info.plist").read_bytes())
widget = plistlib.loads((root / "Widget/Info.plist").read_bytes())
assert app["ManiauAppGroup"] == widget["ManiauAppGroup"] == "$(MANIAU_APP_GROUP)"
assert app["UIBackgroundModes"] == ["location"]
assert app["NSLocationAlwaysAndWhenInUseUsageDescription"]
assert widget["NSExtension"]["NSExtensionPointIdentifier"] == "com.apple.widgetkit-extension"
scheme = ET.parse(root / "Maniau.xcodeproj/xcshareddata/xcschemes/Maniau.xcscheme")
for node in scheme.findall(".//BuildableReference"):
    assert node.attrib["BlueprintIdentifier"] in references
assert len(scheme.findall(".//TestableReference")) == 1
fixture = json.loads((root / "Tests/Fixtures/snapshot-v1.json").read_text(encoding="utf-8"))
assert fixture["schemaVersion"] == 1 and 1 <= len(fixture["departures"]) <= 5
for row in fixture["departures"]:
    date = datetime.fromtimestamp(row["departureAt"] / 1000, timezone(timedelta(hours=9)))
    assert date.strftime("%H:%M") == row["time"]
assert fixture["departures"][1]["departureAt"] / 1000 - (fixture["walkMinutes"] + fixture["stationMinutes"]) * 60 == 1792637220
tests = re.findall(r"func (test\w+)\(", (root / "Tests/WidgetSnapshotTests.swift").read_text(encoding="utf-8"))
print(f"PASS: {len(definitions)} project references, plist/entitlements, shared scheme, fixture timestamps; {len(tests)} XCTest methods present")
print("NOT RUN: Swift compilation, XCTest, simulator, physical device, signing, WidgetKit scheduling, background GPS")
