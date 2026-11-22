import Foundation
import Security

/// The Keychain calls the secret-entry store makes, so a test can stand in
/// for Security.
protocol MastermindKeychainCalls {
  func update(_ query: [String: Any], _ changes: [String: Any]) -> OSStatus
  func add(_ item: [String: Any]) -> OSStatus
  func delete(_ query: [String: Any]) -> OSStatus
  func copyMatching(_ query: [String: Any]) -> (OSStatus, AnyObject?)
}

struct MastermindSystemKeychain: MastermindKeychainCalls {
  func update(_ query: [String: Any], _ changes: [String: Any]) -> OSStatus {
    SecItemUpdate(query as CFDictionary, changes as CFDictionary)
  }

  func add(_ item: [String: Any]) -> OSStatus {
    SecItemAdd(item as CFDictionary, nil)
  }

  func delete(_ query: [String: Any]) -> OSStatus {
    SecItemDelete(query as CFDictionary)
  }

  func copyMatching(_ query: [String: Any]) -> (OSStatus, AnyObject?) {
    var found: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &found)
    return (status, found)
  }
}

/// Mastermind secret entry's own Keychain items: the paired-machine pins
/// with their used pairings, and the saved wrong-code counts. Each is a
/// generic password in the service `tuturuuu.mastermind-secret`, this device
/// only, readable only while unlocked, never synced.
///
/// A write changes an existing item in place and never deletes: when the
/// update fails the item keeps its old value and the failure is thrown.
/// Losing a pin item would also lose the record of used pairings. A read
/// that fails is thrown too, so it can never be taken for "no item".
/// This file must not import Flutter: the macOS self-test compiles it
/// (scripts/mastermind-fleet/secret-hpke/store-selftest.swift).
/// Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
struct MastermindSecretStore {
  static let service = "tuturuuu.mastermind-secret"
  static let maxKeyBytes = 256
  static let maxValueBytes = 256 * 1024

  struct Failure: Error, Equatable {
    let status: OSStatus
  }

  let keychain: MastermindKeychainCalls

  init(keychain: MastermindKeychainCalls = MastermindSystemKeychain()) {
    self.keychain = keychain
  }

  /// The item for `key`, or every item of the service without one.
  private func item(_ key: String?) -> [String: Any] {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.service,
      kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
    ]
    if let key { query[kSecAttrAccount as String] = key }
    return query
  }

  /// The stored text, or nil when there is no item.
  func read(_ key: String) throws -> String? {
    var query = item(key)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    let (status, found) = keychain.copyMatching(query)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw Failure(status: status) }
    guard let data = found as? Data, let text = String(data: data, encoding: .utf8) else {
      throw Failure(status: errSecDecode)
    }
    return text
  }

  /// Stores `value` under `key`: an update when the item exists, an add
  /// only when it does not. Nothing is deleted on any path.
  func write(_ key: String, _ value: String) throws {
    let data = Data(value.utf8)
    let changes: [String: Any] = [kSecValueData as String: data]
    var status = keychain.update(item(key), changes)
    if status == errSecItemNotFound {
      var created = item(key)
      created[kSecValueData as String] = data
      created[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
      status = keychain.add(created)
      // Another writer created it in between: change that item in place.
      if status == errSecDuplicateItem { status = keychain.update(item(key), changes) }
    }
    guard status == errSecSuccess else { throw Failure(status: status) }
  }

  /// Removes the item. A missing item is not a failure.
  func delete(_ key: String) throws {
    let status = keychain.delete(item(key))
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw Failure(status: status)
    }
  }

  /// The key of every item of the service. The listing asks for attributes
  /// only: the Keychain does not return password data for a match-all
  /// query, and an erase needs the names alone, so it works even when an
  /// item's value cannot be read.
  func keys() throws -> [String] {
    var query = item(nil)
    query[kSecReturnAttributes as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitAll
    let (status, found) = keychain.copyMatching(query)
    if status == errSecItemNotFound { return [] }
    guard status == errSecSuccess else { throw Failure(status: status) }
    guard let rows = found as? [[String: Any]] else { throw Failure(status: errSecDecode) }
    return try rows.map { row in
      guard let key = row[kSecAttrAccount as String] as? String else {
        throw Failure(status: errSecDecode)
      }
      return key
    }
  }

  /// Every item of the service, by key: the names, then each value by its
  /// own read. An item deleted since the listing is left out.
  func readAll() throws -> [String: String] {
    var all: [String: String] = [:]
    for key in try keys() {
      if let text = try read(key) { all[key] = text }
    }
    return all
  }
}
