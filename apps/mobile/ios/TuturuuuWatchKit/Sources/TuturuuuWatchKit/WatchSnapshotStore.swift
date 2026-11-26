import Foundation

public protocol WatchSnapshotStoring: Sendable {
  func readSnapshot() -> WatchTodaySnapshot?
  func saveSnapshot(_ snapshot: WatchTodaySnapshot) throws
  func readMetadata() -> WatchSessionMetadata?
  func saveMetadata(_ metadata: WatchSessionMetadata) throws
  func clearAll()
}

/// Persists non-secret Today snapshots and session metadata in the shared watch App Group
/// so both the Watch app and WidgetKit complications stay synchronized.
public final class AppGroupWatchSnapshotStore: WatchSnapshotStoring, @unchecked Sendable {
  private enum StorageKey {
    static let snapshot = "tuturuuu.watch.today_snapshot.v1"
    static let metadata = "tuturuuu.watch.session_metadata.v1"
  }

  private let defaults: UserDefaults

  public init(appGroupIdentifier: String? = nil) {
    if let appGroupIdentifier,
       !appGroupIdentifier.isEmpty,
       let suite = UserDefaults(suiteName: appGroupIdentifier) {
      self.defaults = suite
    } else {
      self.defaults = .standard
    }
  }

  public init(defaults: UserDefaults) {
    self.defaults = defaults
  }

  public func readSnapshot() -> WatchTodaySnapshot? {
    guard let data = defaults.data(forKey: StorageKey.snapshot) else { return nil }
    return try? WatchCoders.makeDecoder().decode(WatchTodaySnapshot.self, from: data)
  }

  public func saveSnapshot(_ snapshot: WatchTodaySnapshot) throws {
    let data = try WatchCoders.makeEncoder().encode(snapshot)
    defaults.set(data, forKey: StorageKey.snapshot)
  }

  public func readMetadata() -> WatchSessionMetadata? {
    guard let data = defaults.data(forKey: StorageKey.metadata) else { return nil }
    return try? WatchCoders.makeDecoder().decode(WatchSessionMetadata.self, from: data)
  }

  public func saveMetadata(_ metadata: WatchSessionMetadata) throws {
    let data = try WatchCoders.makeEncoder().encode(metadata)
    defaults.set(data, forKey: StorageKey.metadata)
  }

  public func clearAll() {
    defaults.removeObject(forKey: StorageKey.snapshot)
    defaults.removeObject(forKey: StorageKey.metadata)
  }
}

public final class InMemoryWatchSnapshotStore: WatchSnapshotStoring, @unchecked Sendable {
  private let lock = NSLock()
  private var snapshot: WatchTodaySnapshot?
  private var metadata: WatchSessionMetadata?

  public init(snapshot: WatchTodaySnapshot? = nil, metadata: WatchSessionMetadata? = nil) {
    self.snapshot = snapshot
    self.metadata = metadata
  }

  public func readSnapshot() -> WatchTodaySnapshot? {
    lock.lock()
    defer { lock.unlock() }
    return snapshot
  }

  public func saveSnapshot(_ snapshot: WatchTodaySnapshot) throws {
    lock.lock()
    defer { lock.unlock() }
    self.snapshot = snapshot
  }

  public func readMetadata() -> WatchSessionMetadata? {
    lock.lock()
    defer { lock.unlock() }
    return metadata
  }

  public func saveMetadata(_ metadata: WatchSessionMetadata) throws {
    lock.lock()
    defer { lock.unlock() }
    self.metadata = metadata
  }

  public func clearAll() {
    lock.lock()
    defer { lock.unlock() }
    snapshot = nil
    metadata = nil
  }
}

/// Applies an incoming WatchConnectivity context atomically across Keychain and App Group storage.
public struct WatchSessionCoordinator: Sendable {
  public let secretStore: WatchSecretStore
  public let snapshotStore: WatchSnapshotStoring

  public init(secretStore: WatchSecretStore, snapshotStore: WatchSnapshotStoring) {
    self.secretStore = secretStore
    self.snapshotStore = snapshotStore
  }

  @discardableResult
  public func apply(_ context: WatchSessionContext) throws -> Bool {
    if context.signedOut {
      try secretStore.clearAccessToken()
      snapshotStore.clearAll()
      return false
    }

    let previousUserId = snapshotStore.readMetadata()?.userId
    if let incomingUserId = context.metadata?.userId,
       let previousUserId,
       previousUserId != incomingUserId {
      try secretStore.clearAccessToken()
      snapshotStore.clearAll()
    }

    if let token = context.accessToken?.trimmingCharacters(in: .whitespacesAndNewlines),
       !token.isEmpty {
      try secretStore.saveAccessToken(token)
    }

    if let metadata = context.metadata {
      try snapshotStore.saveMetadata(metadata)
    }

    if let snapshot = context.snapshot {
      try snapshotStore.saveSnapshot(snapshot)
    }

    return secretStore.readAccessToken() != nil && snapshotStore.readMetadata() != nil
  }
}
