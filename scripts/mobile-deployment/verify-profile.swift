import Foundation

// Validate the decoded profile before importing it into the build's search path.
let environment = ProcessInfo.processInfo.environment
func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw NSError(domain: "MobileSigning", code: 1,
                                  userInfo: [NSLocalizedDescriptionKey: message]) }
}
do {
    try require(CommandLine.arguments.count == 2, "Expected a decoded provisioning profile")
    let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
    let object = try PropertyListSerialization.propertyList(from: data, format: nil)
    guard let profile = object as? [String: Any],
          let entitlements = profile["Entitlements"] as? [String: Any],
          let expiration = profile["ExpirationDate"] as? Date,
          let team = environment["APPLE_TEAM_ID"],
          let bundle = environment["APPLE_BUNDLE_ID"] else {
        throw NSError(domain: "MobileSigning", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "Profile or signing identity is incomplete"])
    }
    try require(expiration > Date(), "Provisioning profile has expired")
    try require(profile["ProvisionedDevices"] == nil, "An App Store profile is required; development and ad hoc profiles are not accepted")
    try require((profile["ProvisionsAllDevices"] as? Bool) != true, "Enterprise profiles cannot be used for TestFlight")
    try require((entitlements["get-task-allow"] as? Bool) != true, "Distribution profiles cannot allow debugging")
    try require((profile["TeamIdentifier"] as? [String])?.contains(team) == true, "Profile team does not match the vault")
    try require(entitlements["application-identifier"] as? String == "\(team).\(bundle)", "Profile application id does not match the vault")
    try require(entitlements["aps-environment"] as? String == "production", "Production push notification entitlement is missing")
    try require(UUID(uuidString: profile["UUID"] as? String ?? "") != nil, "Profile UUID is invalid")
    print("Verified App Store provisioning profile and production push entitlement.")
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
