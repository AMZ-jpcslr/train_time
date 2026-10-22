"""Generate the checked-in dependency-free Xcode project with deterministic IDs."""
from pathlib import Path
import hashlib
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
def ident(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()
objects = {}
def add(name, text):
    key = ident(name)
    objects[key] = text
    return key
def seq(values):
    return "(" + ", ".join(values) + ("," if values else "") + ")"
files = {}
for path in sorted(ROOT.rglob("*")):
    if not path.is_file() or path.suffix not in (".swift", ".plist", ".entitlements", ".xcconfig", ".json"):
        continue
    relative = path.relative_to(ROOT).as_posix()
    if path.relative_to(ROOT).parts[0] not in {"App", "Widget", "Shared", "Config", "Tests"}:
        continue
    kind = {".swift": "sourcecode.swift", ".plist": "text.plist.xml", ".entitlements": "text.plist.entitlements", ".xcconfig": "text.xcconfig", ".json": "text.json"}[path.suffix]
    files[relative] = add("file:" + relative, f'isa = PBXFileReference; lastKnownFileType = {kind}; path = "{relative}"; sourceTree = SOURCE_ROOT;')
products = {}
for name, ext, kind in [("Maniau", "app", "wrapper.application"), ("ManiauWidget", "appex", "wrapper.app-extension"), ("ManiauTests", "xctest", "wrapper.cfbundle")]:
    products[name] = add("product:" + name, f'isa = PBXFileReference; explicitFileType = "{kind}"; path = {name}.{ext}; sourceTree = BUILT_PRODUCTS_DIR;')
product_group = add("products", f'isa = PBXGroup; children = {seq(list(products.values()))}; name = Products; sourceTree = "<group>";')
main_group = add("main", f'isa = PBXGroup; children = {seq(list(files.values()) + [product_group])}; sourceTree = "<group>";')

targets = {}
for name in products:
    sources = ["Shared/WidgetSnapshot.swift", "Shared/WalkingUpdate.swift"]
    if name != "ManiauTests": sources += ["Shared/SnapshotStore.swift"]
    sources += {"Maniau": ["App/ManiauApp.swift", "App/TrainWebView.swift", "App/BackgroundWalking.swift"], "ManiauWidget": ["Widget/ManiauWidget.swift"], "ManiauTests": ["Tests/WidgetSnapshotTests.swift"]}[name]
    builds = [add("build:" + name + ":" + p, f'isa = PBXBuildFile; fileRef = {files[p]};') for p in sources]
    source_phase = add("sources:" + name, f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = {seq(builds)}; runOnlyForDeploymentPostprocessing = 0;')
    framework_phase = add("frameworks:" + name, 'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
    resources = []
    if name == "ManiauTests":
        resources.append(add("fixture", f'isa = PBXBuildFile; fileRef = {files["Tests/Fixtures/snapshot-v1.json"]};'))
    resource_phase = add("resources:" + name, f'isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = {seq(resources)}; runOnlyForDeploymentPostprocessing = 0;')
    phases = [source_phase, framework_phase, resource_phase]
    dependencies = []
    if name == "Maniau":
        embed = add("embedfile", f'isa = PBXBuildFile; fileRef = {products["ManiauWidget"]}; settings = {{ATTRIBUTES = (RemoveHeadersOnCopy,);}};')
        phases.append(add("embed", f'isa = PBXCopyFilesBuildPhase; buildActionMask = 2147483647; dstPath = ""; dstSubfolderSpec = 13; files = ({embed},); name = "Embed App Extensions"; runOnlyForDeploymentPostprocessing = 0;'))
        proxy = add("extensionproxy", f'isa = PBXContainerItemProxy; containerPortal = {ident("project")}; proxyType = 1; remoteGlobalIDString = {ident("target:ManiauWidget")}; remoteInfo = ManiauWidget;')
        dependencies.append(add("extensiondependency", f'isa = PBXTargetDependency; target = {ident("target:ManiauWidget")}; targetProxy = {proxy};'))
    configs = []
    for config in ["Debug", "Release"]:
        settings = ['PRODUCT_NAME = "$(TARGET_NAME)";', 'SDKROOT = iphoneos;', 'SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";', 'SUPPORTS_MACCATALYST = NO;', 'SWIFT_EMIT_LOC_STRINGS = YES;']
        settings += ['SWIFT_OPTIMIZATION_LEVEL = "-Onone";', 'DEBUG_INFORMATION_FORMAT = dwarf;', 'SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;'] if config == "Debug" else ['SWIFT_OPTIMIZATION_LEVEL = "-O";', 'DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";']
        if name == "Maniau":
            settings += ['PRODUCT_BUNDLE_IDENTIFIER = "$(MANIAU_APP_BUNDLE_ID)";', 'INFOPLIST_FILE = App/Info.plist;', 'CODE_SIGN_ENTITLEMENTS = App/Maniau.entitlements;', 'LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks";']
        elif name == "ManiauWidget":
            settings += ['PRODUCT_BUNDLE_IDENTIFIER = "$(MANIAU_APP_BUNDLE_ID).widget";', 'INFOPLIST_FILE = Widget/Info.plist;', 'CODE_SIGN_ENTITLEMENTS = Widget/ManiauWidget.entitlements;', 'APPLICATION_EXTENSION_API_ONLY = YES;', 'SKIP_INSTALL = YES;', 'LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks";']
        else:
            settings += ['PRODUCT_BUNDLE_IDENTIFIER = "$(MANIAU_APP_BUNDLE_ID).tests";', 'GENERATE_INFOPLIST_FILE = YES;', 'TEST_HOST = "";', 'LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks @loader_path/Frameworks";']
        configs.append(add("config:" + name + config, f'isa = XCBuildConfiguration; baseConfigurationReference = {files["Config/Project.xcconfig"]}; buildSettings = {{ {" ".join(settings)} }}; name = {config};'))
    config_list = add("configs:" + name, f'isa = XCConfigurationList; buildConfigurations = {seq(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
    product_type = {"Maniau": "application", "ManiauWidget": "app-extension", "ManiauTests": "bundle.unit-test"}[name]
    targets[name] = add("target:" + name, f'isa = PBXNativeTarget; buildConfigurationList = {config_list}; buildPhases = {seq(phases)}; buildRules = (); dependencies = {seq(dependencies)}; name = {name}; productName = {name}; productReference = {products[name]}; productType = "com.apple.product-type.{product_type}";')
configs = [add("projectconfig:" + c, f'isa = XCBuildConfiguration; baseConfigurationReference = {files["Config/Project.xcconfig"]}; buildSettings = {{ ALWAYS_SEARCH_USER_PATHS = NO; CLANG_ENABLE_OBJC_ARC = YES; }}; name = {c};') for c in ["Debug", "Release"]]
config_list = add("projectconfigs", f'isa = XCConfigurationList; buildConfigurations = {seq(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
add("project", f'isa = PBXProject; attributes = {{BuildIndependentTargetsInParallel = YES; LastUpgradeCheck = 1600;}}; buildConfigurationList = {config_list}; compatibilityVersion = "Xcode 14.0"; developmentRegion = ja; hasScannedForEncodings = 0; knownRegions = (ja, en, Base,); mainGroup = {main_group}; productRefGroup = {product_group}; projectDirPath = ""; projectRoot = ""; targets = {seq(list(targets.values()))};')
project = ROOT / "Maniau.xcodeproj"
project.mkdir(exist_ok=True)
text = '// !$*UTF8*$!\n{\n archiveVersion = 1;\n classes = {};\n objectVersion = 56;\n objects = {\n'
text += ''.join(f'  {key} = {{ {value} }};\n' for key, value in objects.items())
text += f' }};\n rootObject = {ident("project")};\n}}\n'
(project / "project.pbxproj").write_text(text, encoding="utf-8")
scheme = ET.Element("Scheme", LastUpgradeVersion="1600", version="1.3")
build = ET.SubElement(scheme, "BuildAction", parallelizeBuildables="YES", buildImplicitDependencies="YES")
entries = ET.SubElement(build, "BuildActionEntries")
def reference(parent, name):
    ext = {"Maniau": "app", "ManiauTests": "xctest"}[name]
    ET.SubElement(parent, "BuildableReference", BuildableIdentifier="primary", BlueprintIdentifier=targets[name], BuildableName=f"{name}.{ext}", BlueprintName=name, ReferencedContainer="container:Maniau.xcodeproj")
for name in ["Maniau", "ManiauTests"]:
    attrs = {"buildForTesting": "YES", "buildForRunning": "YES" if name == "Maniau" else "NO", "buildForProfiling": "YES" if name == "Maniau" else "NO", "buildForArchiving": "YES" if name == "Maniau" else "NO", "buildForAnalyzing": "YES"}
    reference(ET.SubElement(entries, "BuildActionEntry", **attrs), name)
test = ET.SubElement(scheme, "TestAction", buildConfiguration="Debug", selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB", selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB", shouldUseLaunchSchemeArgsEnv="YES")
reference(ET.SubElement(ET.SubElement(test, "Testables"), "TestableReference", skipped="NO"), "ManiauTests")
launch = ET.SubElement(scheme, "LaunchAction", buildConfiguration="Debug", selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB", selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB", launchStyle="0", useCustomWorkingDirectory="NO", ignoresPersistentStateOnLaunch="NO", debugDocumentVersioning="YES", debugServiceExtension="internal", allowLocationSimulation="YES")
reference(ET.SubElement(launch, "BuildableProductRunnable", runnableDebuggingMode="0"), "Maniau")
profile = ET.SubElement(scheme, "ProfileAction", buildConfiguration="Release", shouldUseLaunchSchemeArgsEnv="YES", savedToolIdentifier="", useCustomWorkingDirectory="NO", debugDocumentVersioning="YES")
reference(ET.SubElement(profile, "BuildableProductRunnable", runnableDebuggingMode="0"), "Maniau")
ET.SubElement(scheme, "AnalyzeAction", buildConfiguration="Debug")
ET.SubElement(scheme, "ArchiveAction", buildConfiguration="Release", revealArchiveInOrganizer="YES")
folder = project / "xcshareddata/xcschemes"
folder.mkdir(parents=True, exist_ok=True)
ET.indent(scheme)
ET.ElementTree(scheme).write(folder / "Maniau.xcscheme", encoding="utf-8", xml_declaration=True)
print(f"Generated {len(objects)} Xcode project objects and shared Maniau scheme")
