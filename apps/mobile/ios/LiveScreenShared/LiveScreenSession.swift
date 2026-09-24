import Foundation

struct LiveScreenSession: Codable {
  let id: String
  let heartbeat: TimeInterval
  let stopMessage: String

  static func directory(group: String) throws -> URL {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      throw NSError(domain: "LiveScreenCapture", code: 1)
    }
    let directory = container.appendingPathComponent("live-screen-capture", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])
    return directory
  }

  static func current(in directory: URL) -> LiveScreenSession? {
    guard let data = try? Data(contentsOf: directory.appendingPathComponent("session.json")),
      let session = try? JSONDecoder().decode(Self.self, from: data),
      UUID(uuidString: session.id) != nil,
      abs(Date().timeIntervalSince1970 - session.heartbeat) < 10 else { return nil }
    return session
  }

  func write(in directory: URL) throws {
    try JSONEncoder().encode(self).write(to: directory.appendingPathComponent("session.json"),
      options: [.atomic, .completeFileProtection])
  }

  func alive(in directory: URL) -> URL { directory.appendingPathComponent("alive-\(id)") }

  func frame(in directory: URL) -> URL { directory.appendingPathComponent("frame-\(id).jpg") }
  func status(in directory: URL) -> URL { directory.appendingPathComponent("status-\(id)") }
}
