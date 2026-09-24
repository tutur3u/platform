import Foundation
import PathKit
import XcodeProj

// Use XcodeProj's object model; never patch the OpenStep project text.
let root = Path(CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "apps/mobile/ios").absolute()
let path = root + "Runner.xcodeproj"
let project = try XcodeProj(path: path)
let pbx = project.pbxproj
guard let main = try pbx.rootGroup() else { fatalError("Missing root group") }
guard let runner = pbx.nativeTargets.first(where: { $0.name == "Runner" }),
      let runnerGroup = pbx.groups.first(where: { $0.path == "Runner" }),
      let runnerSources = runner.buildPhases.compactMap({ $0 as? PBXSourcesBuildPhase }).first,
      let projectObject = pbx.projects.first else { fatalError("Runner project is incomplete") }

func group(_ name: String) throws -> PBXGroup {
  if let existing = pbx.groups.first(where: { $0.path == name }) { return existing }
  return try main.addGroup(named: name).first!
}
func source(_ file: String, in group: PBXGroup, phase: PBXSourcesBuildPhase) throws {
  let reference = try group.addFile(at: root + file, sourceRoot: root)
  if !(phase.files ?? []).contains(where: { $0.file == reference }) { _ = try phase.add(file: reference) }
}
try source("Runner/LiveScreenCapturePlugin.swift", in: runnerGroup, phase: runnerSources)
let shared = try group("LiveScreenShared")
try source("LiveScreenShared/LiveScreenSession.swift", in: shared, phase: runnerSources)

let broadcast = try group("LiveScreenBroadcast")
let extensionConfig = try broadcast.addFile(at: root + "LiveScreenBroadcast/Build.xcconfig", sourceRoot: root)
let extensionTarget: PBXNativeTarget
if let existing = pbx.nativeTargets.first(where: { $0.name == "LiveScreenBroadcast" }) {
  extensionTarget = existing
} else {
  let product = PBXFileReference(sourceTree: .buildProductsDir, explicitFileType: "wrapper.app-extension", path: "LiveScreenBroadcast.appex")
  pbx.add(object: product)
  projectObject.productsGroup?.children.append(product)
  let configurations = (runner.buildConfigurationList?.buildConfigurations ?? []).map { configuration -> XCBuildConfiguration in
    let host = configuration.buildSettings["PRODUCT_BUNDLE_IDENTIFIER"] as? String ?? "com.tuturuuu.app.mobile"
    let config = XCBuildConfiguration(name: configuration.name,
      baseConfiguration: extensionConfig,
      buildSettings: [
        "PRODUCT_BUNDLE_IDENTIFIER": "\(host).LiveScreenBroadcast", "LIVE_HOST_BUNDLE_ID": host,
        "PRODUCT_NAME": "$(TARGET_NAME)", "INFOPLIST_FILE": "LiveScreenBroadcast/Info.plist",
        "CODE_SIGN_ENTITLEMENTS": "LiveScreenBroadcast/LiveScreenBroadcast.entitlements",
        "SWIFT_VERSION": "5.0", "TARGETED_DEVICE_FAMILY": "1,2", "SKIP_INSTALL": "YES",
        "APPLICATION_EXTENSION_API_ONLY": "YES", "IPHONEOS_DEPLOYMENT_TARGET": "$(RECOMMENDED_IPHONEOS_DEPLOYMENT_TARGET)",
        "GENERATE_INFOPLIST_FILE": "NO",
        "SWIFT_OPTIMIZATION_LEVEL": configuration.name.hasPrefix("Debug") ? "-Onone" : "-O",
        "DEVELOPMENT_TEAM": configuration.buildSettings["DEVELOPMENT_TEAM"] ?? "8H6TTBD6T8",
        "PROVISIONING_PROFILE_SPECIFIER": "$(LIVE_BROADCAST_PROFILE_UUID)",
      ])
    pbx.add(object: config); return config
  }
  let list = XCConfigurationList(buildConfigurations: configurations, defaultConfigurationName: "Release-production")
  pbx.add(object: list)
  let sources = PBXSourcesBuildPhase(); pbx.add(object: sources)
  let resources = PBXResourcesBuildPhase(); pbx.add(object: resources)
  let frameworks = PBXFrameworksBuildPhase(); pbx.add(object: frameworks)
  extensionTarget = PBXNativeTarget(name: "LiveScreenBroadcast", buildConfigurationList: list,
    buildPhases: [sources, resources, frameworks], productName: "LiveScreenBroadcast", product: product, productType: .appExtension)
  pbx.add(object: extensionTarget); projectObject.targets.append(extensionTarget)
  _ = try runner.addDependency(target: extensionTarget)
  let embed = PBXBuildFile(file: product, settings: ["ATTRIBUTES": ["RemoveHeadersOnCopy"]]); pbx.add(object: embed)
  let phase = PBXCopyFilesBuildPhase(dstPath: "", dstSubfolderSpec: .plugins,
    name: "Embed Live Broadcast Extension", files: [embed]); pbx.add(object: phase)
  // Embed before Flutter's build scripts to preserve normal extension dependency ordering.
  runner.buildPhases.insert(phase, at: 0)
}
guard let extensionSources = extensionTarget.buildPhases.compactMap({ $0 as? PBXSourcesBuildPhase }).first else { fatalError("Missing extension sources") }
try source("LiveScreenBroadcast/SampleHandler.swift", in: broadcast, phase: extensionSources)
try source("LiveScreenShared/LiveScreenSession.swift", in: shared, phase: extensionSources)
if let resources = extensionTarget.buildPhases.compactMap({ $0 as? PBXResourcesBuildPhase }).first,
   !broadcast.children.contains(where: { $0.name == "Localizable.strings" }) {
  let translations = PBXVariantGroup(children: [], sourceTree: .group, name: "Localizable.strings")
  pbx.add(object: translations); broadcast.children.append(translations)
  for language in ["en", "vi"] {
    let file = PBXFileReference(sourceTree: .group, name: language,
      lastKnownFileType: "text.plist.strings", path: "\(language).lproj/Localizable.strings")
    pbx.add(object: file); translations.children.append(file)
  }
  _ = try resources.add(file: translations)
}
try project.write(path: path)
print("Configured ReplayKit target and source memberships.")
