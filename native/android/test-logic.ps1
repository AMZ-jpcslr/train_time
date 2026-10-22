$ErrorActionPreference = 'Stop'
$AndroidProject = $PSScriptRoot
$OutputClasses = Join-Path $AndroidProject '.test-classes'
New-Item -ItemType Directory -Force -Path $OutputClasses | Out-Null
$JavaSource = Join-Path $AndroidProject 'app/src/main/java/jp/maniau/widget'
& javac -encoding UTF-8 --release 17 -d $OutputClasses "$JavaSource/StrictJson.java" "$JavaSource/TrustedOrigin.java" "$JavaSource/WidgetSnapshot.java" "$JavaSource/WidgetPresentation.java" "$JavaSource/RouteUpdatePolicy.java" "$AndroidProject/tests/WidgetLogicTest.java" "$AndroidProject/tests/SnapshotContractCheck.java"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& java -cp $OutputClasses jp.maniau.widget.WidgetLogicTest
exit $LASTEXITCODE
