import Foundation
#if canImport(Security)
import Security
#endif

public protocol WatchSecretStore: Sendable {
  func readAccessToken() -> String?
  func saveAccessToken(_ token: String) throws
  func clearAccessToken() throws
}

public enum WatchKeychainError: Error, Equatable {
  case encodingFailed
  case operationFailed(Int32)
}

/// Keychain-backed store for short-lived Supabase Bearer tokens on watchOS/iOS.
/// Tokens are persisted exclusively in the Watch Keychain (`AfterFirstUnlockThisDeviceOnly`)
/// and never stored in App Group UserDefaults, snapshots, or logs.
public final class WatchKeychainStore: WatchSecretStore, @unchecked Sendable {
  private let service: String
  private let account: String

  public init(
    service: String = "com.tuturuuu.watch.session",
    account: String = "supabase_access_token"
  ) {
    self.service = service
    self.account = account
  }

  public func readAccessToken() -> String? {
    #if canImport(Security)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else {
      return nil
    }
    return String(data: data, encoding: .utf8)
    #else
    return nil
    #endif
  }

  public func saveAccessToken(_ token: String) throws {
    #if canImport(Security)
    guard let data = token.data(using: .utf8) else {
      throw WatchKeychainError.encodingFailed
    }
    try clearAccessToken()
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw WatchKeychainError.operationFailed(status)
    }
    #endif
  }

  public func clearAccessToken() throws {
    #if canImport(Security)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw WatchKeychainError.operationFailed(status)
    }
    #endif
  }
}

public final class InMemoryWatchSecretStore: WatchSecretStore, @unchecked Sendable {
  private let lock = NSLock()
  private var token: String?

  public init(initialToken: String? = nil) {
    self.token = initialToken
  }

  public func readAccessToken() -> String? {
    lock.lock()
    defer { lock.unlock() }
    return token
  }

  public func saveAccessToken(_ token: String) throws {
    lock.lock()
    defer { lock.unlock() }
    self.token = token
  }

  public func clearAccessToken() throws {
    lock.lock()
    defer { lock.unlock() }
    token = nil
  }
}
