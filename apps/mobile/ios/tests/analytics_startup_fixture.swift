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
print("7 persisted-state assertions passed")
