let manager = FileManager.default
let root = manager.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try manager.createDirectory(at: root, withIntermediateDirectories: true)
defer { try? manager.removeItem(at: root) }
let suite = "analytics-gate-test-" + UUID().uuidString
let defaults = UserDefaults(suiteName: suite)!
defer { defaults.removePersistentDomain(forName: suite) }
let file = root.appendingPathComponent(AnalyticsStartupGate.relativeFile)
try manager.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
for seed in [1, 2] {
  defaults.set(seed, forKey: AnalyticsStartupGate.stateKey)
  let data = try PropertyListSerialization.data(
    fromPropertyList: [AnalyticsStartupGate.stateKey: seed, "unrelated": 7], format: .binary, options: 0)
  try data.write(to: file)
  AnalyticsStartupGate.disableBeforeInitialization(defaults: defaults, support: root)
  let firstSdkRead = try PropertyListSerialization.propertyList(from: Data(contentsOf: file), format: nil) as! [String: Any]
  precondition(defaults.integer(forKey: AnalyticsStartupGate.stateKey) == 2)
  precondition(firstSdkRead[AnalyticsStartupGate.stateKey] as? Int == 2)
  precondition(firstSdkRead["unrelated"] as? Int == 7)
}
try manager.removeItem(at: file)
AnalyticsStartupGate.disableBeforeInitialization(defaults: defaults, support: root)
precondition(defaults.integer(forKey: AnalyticsStartupGate.stateKey) == 2)
// Malformed bytes and a valid plist with the wrong root type both recover.
let invalidRoot = try PropertyListSerialization.data(fromPropertyList: [1, 2], format: .binary, options: 0)
for corrupt in [Data("corrupt plist".utf8), invalidRoot] {
  defaults.set(1, forKey: AnalyticsStartupGate.stateKey)
  try corrupt.write(to: file)
  precondition(AnalyticsStartupGate.disableBeforeInitialization(defaults: defaults, support: root))
  let repaired = try PropertyListSerialization.propertyList(from: Data(contentsOf: file), format: nil) as! [String: Any]
  precondition(repaired[AnalyticsStartupGate.stateKey] as? Int == 2)
  precondition(defaults.integer(forKey: AnalyticsStartupGate.stateKey) == 2)
}
// A replacement failure returns a closed startup gate instead of crashing.
try manager.removeItem(at: file)
try manager.createDirectory(at: file, withIntermediateDirectories: true)
precondition(!AnalyticsStartupGate.disableBeforeInitialization(defaults: defaults, support: root))
// All old Allows are reset at launch; only a post-auth admit path can start.
defaults.set(true, forKey: FirebaseAdmissionGate.analyticsKey)
defaults.set(true, forKey: FirebaseAdmissionGate.installationsKey)
FirebaseAdmissionGate.reset(defaults: defaults)
precondition(!defaults.bool(forKey: FirebaseAdmissionGate.analyticsKey))
precondition(!defaults.bool(forKey: FirebaseAdmissionGate.installationsKey))
for signedIn in [false, true] {
  for push in [false, true] {
    for telemetry in [false, true] {
      precondition(FirebaseAdmissionGate.allowsStartup(signedIn: signedIn, push: push, telemetry: telemetry)
        == (signedIn && (push || telemetry)))
    }
  }
}
print("24 persisted-state and admission assertions passed")
