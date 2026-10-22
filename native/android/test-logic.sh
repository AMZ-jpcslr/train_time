#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
mkdir -p .test-classes
src=app/src/main/java/jp/maniau/widget
javac -encoding UTF-8 --release 17 -d .test-classes "$src/StrictJson.java" "$src/TrustedOrigin.java" "$src/WidgetSnapshot.java" "$src/WidgetPresentation.java" "$src/RouteUpdatePolicy.java" tests/WidgetLogicTest.java tests/SnapshotContractCheck.java
java -cp .test-classes jp.maniau.widget.WidgetLogicTest
