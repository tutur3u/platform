import CryptoKit
import Flutter
import Foundation
import Security

/// Mastermind secret entry on the phone: the `mobile/mastermind_secret`
/// channel over `MastermindSecretCrypto` (HPKE seal, Ed25519 verify, pairing
/// HKDF and HMAC) and the per-account Ed25519 owner key in the Keychain.
///
/// The owner key is a CryptoKit `Curve25519.Signing.PrivateKey` stored as a
/// generic password (this device only, readable while unlocked, never
/// synced); it never crosses the channel. Below iOS 17 `supported` is false
/// and every crypto method fails with `unsupported`. The `store*` methods
/// reach the pins and saved counts through `MastermindSecretStore` on every
/// iOS version, so an erase works wherever items could exist. Errors are
/// fixed codes; nothing here logs keys, messages or plaintext.
/// Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
final class MastermindSecretPlugin: NSObject, FlutterPlugin {
  private let queue = DispatchQueue(label: "com.tuturuuu.mobile.mastermind-secret")

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "mobile/mastermind_secret", binaryMessenger: registrar.messenger())
    registrar.addMethodCallDelegate(MastermindSecretPlugin(), channel: channel)
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    if call.method.hasPrefix("store") {
      handleStore(call, result: result)
      return
    }
    guard #available(iOS 17.0, *) else {
      result(call.method == "supported" ? false : Self.failure("unsupported"))
      return
    }
    let args = call.arguments as? [String: Any] ?? [:]
    switch call.method {
    case "supported": result(true)
    case "seal":
      guard let publicKey = Self.bytes(args, "publicKey", count: 32),
            let aad = Self.bytes(args, "aad", max: 16_384),
            var plaintext = Self.bytes(args, "plaintext", max: 17 * 256),
            !plaintext.isEmpty
      else { result(Self.failure("bad_arguments")); return }
      run(result) {
        defer { MastermindSecretCrypto.wipe(&plaintext) }
        let sealed = try MastermindSecretCrypto.seal(
          recipientPublicKey: publicKey, aad: aad, plaintext: plaintext)
        return [
          "enc": FlutterStandardTypedData(bytes: sealed.enc),
          "ct": FlutterStandardTypedData(bytes: sealed.ct),
        ]
      }
    case "ownerPublicKey":
      guard let account = Self.account(args) else { result(Self.failure("bad_arguments")); return }
      run(result) {
        FlutterStandardTypedData(bytes: try OwnerKeychain.key(account: account, create: true).publicKey.rawRepresentation)
      }
    case "ownerSign":
      guard let account = Self.account(args),
            let message = Self.bytes(args, "message", max: 16_384), !message.isEmpty
      else { result(Self.failure("bad_arguments")); return }
      run(result) {
        let key = try OwnerKeychain.key(account: account, create: false)
        return FlutterStandardTypedData(bytes: try key.signature(for: message))
      }
    case "deleteOwnerKeys":
      let account = args["accountId"] as? String
      guard account == nil || Self.account(args) != nil else {
        result(Self.failure("bad_arguments"))
        return
      }
      run(result) { try OwnerKeychain.delete(account: account); return nil }
    case "verifyEd25519":
      guard let publicKey = Self.bytes(args, "publicKey", count: 32),
            let message = Self.bytes(args, "message", max: 65_536),
            let signature = Self.bytes(args, "signature", count: 64)
      else { result(Self.failure("bad_arguments")); return }
      run(result) {
        MastermindSecretCrypto.verifyEd25519(publicKey: publicKey, message: message, signature: signature)
      }
    case "pairingKey":
      guard var code = Self.bytes(args, "code", count: 10),
            let pairingId = args["pairingId"] as? String,
            pairingId.range(of: "^pair-[0-9a-f]{24}$", options: .regularExpression) != nil
      else { result(Self.failure("bad_arguments")); return }
      run(result) {
        defer { MastermindSecretCrypto.wipe(&code) }
        return FlutterStandardTypedData(
          bytes: MastermindSecretCrypto.hkdfSha256(
            ikm: code, salt: Data(pairingId.utf8),
            info: Data("tuturuuu-mm-secret-pair-v1".utf8), count: 32))
      }
    case "hmac":
      guard var key = Self.bytes(args, "key", count: 32),
            let message = Self.bytes(args, "message", max: 4096)
      else { result(Self.failure("bad_arguments")); return }
      run(result) {
        defer { MastermindSecretCrypto.wipe(&key) }
        return FlutterStandardTypedData(bytes: MastermindSecretCrypto.hmacSha256(key: key, message: message))
      }
    case "macEqual":
      guard let a = Self.bytes(args, "a", max: 64), let b = Self.bytes(args, "b", max: 64)
      else { result(Self.failure("bad_arguments")); return }
      result(MastermindSecretCrypto.constantTimeEqual(a, b))
    default: result(FlutterMethodNotImplemented)
    }
  }

  /// `storeRead`, `storeWrite`, `storeDelete`, `storeKeys` and
  /// `storeReadAll`. A Keychain failure crosses as `keychain` with the
  /// OSStatus in `details`.
  private func handleStore(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let args = call.arguments as? [String: Any] ?? [:]
    let store = MastermindSecretStore()
    switch call.method {
    case "storeRead":
      guard let key = Self.storeKey(args) else { result(Self.failure("bad_arguments")); return }
      run(result) { try store.read(key) }
    case "storeWrite":
      guard let key = Self.storeKey(args), let value = args["value"] as? String,
            value.utf8.count <= MastermindSecretStore.maxValueBytes
      else { result(Self.failure("bad_arguments")); return }
      run(result) { try store.write(key, value); return nil }
    case "storeDelete":
      guard let key = Self.storeKey(args) else { result(Self.failure("bad_arguments")); return }
      run(result) { try store.delete(key); return nil }
    case "storeKeys":
      run(result) { try store.keys() }
    case "storeReadAll":
      run(result) { try store.readAll() }
    default: result(FlutterMethodNotImplemented)
    }
  }

  private static func storeKey(_ args: [String: Any]) -> String? {
    guard let key = args["key"] as? String, !key.isEmpty,
          key.utf8.count <= MastermindSecretStore.maxKeyBytes
    else { return nil }
    return key
  }

  private func run(_ result: @escaping FlutterResult, _ body: @escaping () throws -> Any?) {
    queue.async {
      let value: Any?
      do { value = try body() } catch let error as SecretError { value = Self.failure(error.code) } catch let error
        as MastermindSecretStore.Failure
      {
        value = FlutterError(
          code: "keychain", message: "Mastermind secret entry unavailable",
          details: Int(error.status))
      } catch {
        value = Self.failure("failed")
      }
      DispatchQueue.main.async { result(value) }
    }
  }

  private static func failure(_ code: String) -> FlutterError {
    FlutterError(code: code, message: "Mastermind secret entry unavailable", details: nil)
  }

  private static func bytes(_ args: [String: Any], _ name: String, count: Int? = nil, max: Int? = nil) -> Data? {
    guard let data = (args[name] as? FlutterStandardTypedData)?.data else { return nil }
    if let count, data.count != count { return nil }
    if let max, data.count > max { return nil }
    return data
  }

  /// A Supabase user id or another opaque account id: 1 to 128 safe characters.
  private static func account(_ args: [String: Any]) -> String? {
    guard let account = args["accountId"] as? String,
          account.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil
    else { return nil }
    return account
  }
}

private struct SecretError: Error {
  let code: String
  init(_ code: String) { self.code = code }
}

/// One Ed25519 owner key per account, as a Keychain generic password.
@available(iOS 17.0, *)
private enum OwnerKeychain {
  static let service = "com.tuturuuu.mastermind.secret-owner"

  private static func baseQuery(account: String?) -> [String: Any] {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
    ]
    if let account { query[kSecAttrAccount as String] = account }
    return query
  }

  static func key(account: String, create: Bool) throws -> Curve25519.Signing.PrivateKey {
    if let key = try read(account: account) { return key }
    guard create else { throw SecretError("no_key") }
    let key = Curve25519.Signing.PrivateKey()
    var raw = key.rawRepresentation
    defer { MastermindSecretCrypto.wipe(&raw) }
    var attributes = baseQuery(account: account)
    attributes[kSecValueData as String] = raw
    attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let status = SecItemAdd(attributes as CFDictionary, nil)
    if status == errSecDuplicateItem, let existing = try read(account: account) { return existing }
    guard status == errSecSuccess else { throw SecretError("keychain") }
    return key
  }

  private static func read(account: String) throws -> Curve25519.Signing.PrivateKey? {
    var query = baseQuery(account: account)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, var raw = item as? Data else { throw SecretError("keychain") }
    defer { MastermindSecretCrypto.wipe(&raw) }
    guard raw.count == 32, let key = try? Curve25519.Signing.PrivateKey(rawRepresentation: raw)
    else { throw SecretError("keychain") }
    return key
  }

  static func delete(account: String?) throws {
    let status = SecItemDelete(baseQuery(account: account) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw SecretError("keychain") }
  }
}
