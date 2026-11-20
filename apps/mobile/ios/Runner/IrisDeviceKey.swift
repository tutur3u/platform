import CryptoKit
import Flutter
import Foundation
import LocalAuthentication
import Security

/// The Iris device key: a non-exportable P-256 key in the Secure Enclave,
/// usable only after Face ID or Touch ID on the current biometric set. See
/// lib/features/mastermind/iris/device/SECURITY.md.
///
/// Reads share one biometric session (an evaluated LAContext) for at most
/// five minutes; a sensitive sign always evaluates a fresh context. Nothing
/// here logs key material, signed bytes or signatures.
final class IrisDeviceKeyPlugin: NSObject, FlutterPlugin {
  private static let tag = Data("com.tuturuuu.mobile.iris.device-key.v1".utf8)
  private static let sessionSeconds: TimeInterval = 300

  private let queue = DispatchQueue(label: "com.tuturuuu.mobile.iris-device-key")
  private var session: LAContext?
  private var sessionStarted: Date?

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(name: "mobile/iris_device_key", binaryMessenger: registrar.messenger())
    registrar.addMethodCallDelegate(IrisDeviceKeyPlugin(), channel: channel)
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let args = call.arguments as? [String: Any]
    switch call.method {
    case "ensureKey": run(result) { try self.ensureKey() }
    case "sign":
      guard let data = (args?["data"] as? FlutterStandardTypedData)?.data, !data.isEmpty,
            let sensitive = args?["sensitive"] as? Bool,
            let reason = args?["reason"] as? String, !reason.isEmpty, reason.count <= 200
      else { result(Self.failure("bad_arguments")); return }
      // The signed bytes decide: a write always prompts, whatever the
      // caller's flag says, and only a v3 string is signed.
      guard let prompt = IrisSignPolicy.mustPrompt(data, sensitive: sensitive)
      else { result(Self.failure("bad_arguments")); return }
      run(result) { FlutterStandardTypedData(bytes: try self.sign(data, sensitive: prompt, reason: reason)) }
    case "deleteKey": run(result) { try self.deleteKey(); return nil }
    case "lock": run(result) { self.dropSession(); return nil }
    default: result(FlutterMethodNotImplemented)
    }
  }

  private func run(_ result: @escaping FlutterResult, _ body: @escaping () throws -> Any?) {
    queue.async {
      let value: Any?
      do { value = try body() } catch let error as KeyError { value = Self.failure(error.code) } catch {
        value = Self.failure("failed")
      }
      DispatchQueue.main.async { result(value) }
    }
  }

  private static func failure(_ code: String) -> FlutterError {
    FlutterError(code: code, message: "Iris device key unavailable", details: nil)
  }

  private func ensureKey() throws -> [String: String] {
    guard SecureEnclave.isAvailable else { throw KeyError("unsupported") }
    let key = try findKey(context: nil) ?? createKey()
    guard let publicKey = SecKeyCopyPublicKey(key),
          let point = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?,
          point.count == 65, point.first == 0x04
    else { throw KeyError("failed") }
    let spki = p256SpkiPrefix + point
    let fingerprint = SHA256.hash(data: spki).map { String(format: "%02x", $0) }.joined()
    return ["publicKey": spki.base64EncodedString(), "fingerprint": fingerprint, "hardware": "secure_enclave"]
  }

  private func createKey() throws -> SecKey {
    var error: NSError?
    guard LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
      throw Self.authError(error)
    }
    guard let access = SecAccessControlCreateWithFlags(
      nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, [.privateKeyUsage, .biometryCurrentSet], nil)
    else { throw KeyError("failed") }
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeySizeInBits as String: 256,
      kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
      kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: Self.tag,
        kSecAttrAccessControl as String: access,
      ] as [String: Any],
    ]
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, nil) else { throw KeyError("failed") }
    return key
  }

  private func findKey(context: LAContext?) throws -> SecKey? {
    var query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: Self.tag,
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
      kSecReturnRef as String: true,
    ]
    if let context { query[kSecUseAuthenticationContext as String] = context }
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let item, CFGetTypeID(item) == SecKeyGetTypeID() else {
      throw KeyError("failed")
    }
    return (item as! SecKey)
  }

  private func sign(_ data: Data, sensitive: Bool, reason: String) throws -> Data {
    let context = try authenticatedContext(sensitive: sensitive, reason: reason)
    guard let key = try findKey(context: context) else { throw KeyError("no_key") }
    var error: Unmanaged<CFError>?
    guard let signature = SecKeyCreateSignature(
      key, .ecdsaSignatureMessageX962SHA256, data as CFData, &error) as Data?
    else {
      let status = (error?.takeRetainedValue() as Error?).map { OSStatus(($0 as NSError).code) }
      if !sensitive { dropSession() }
      switch status {
      case errSecUserCanceled: throw KeyError("cancelled")
      case errSecInteractionNotAllowed: throw KeyError("interaction_not_allowed")
      case errSecItemNotFound: throw KeyError("no_key")
      default: throw KeyError("failed")
      }
    }
    return signature
  }

  /// A context that has passed biometrics: fresh for a sensitive sign,
  /// otherwise the read session, renewed after [sessionSeconds].
  private func authenticatedContext(sensitive: Bool, reason: String) throws -> LAContext {
    if !sensitive, let session, let started = sessionStarted,
       Date().timeIntervalSince(started) < Self.sessionSeconds {
      return session
    }
    let context = LAContext()
    context.touchIDAuthenticationAllowableReuseDuration = 0
    context.localizedFallbackTitle = ""
    let done = DispatchSemaphore(value: 0)
    var failure: Error?
    context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { ok, error in
      if !ok { failure = error ?? KeyError("failed") }
      done.signal()
    }
    done.wait()
    if let failure {
      if !sensitive { dropSession() }
      throw Self.authError(failure as NSError)
    }
    if !sensitive {
      dropSession()
      session = context
      sessionStarted = Date()
    }
    return context
  }

  private func deleteKey() throws {
    dropSession()
    let status = SecItemDelete([
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: Self.tag,
    ] as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw KeyError("failed") }
  }

  private func dropSession() {
    session?.invalidate()
    session = nil
    sessionStarted = nil
  }

  private static func authError(_ error: NSError?) -> KeyError {
    guard let error, error.domain == LAErrorDomain else { return KeyError("failed") }
    switch LAError.Code(rawValue: error.code) {
    case .userCancel, .appCancel, .systemCancel, .userFallback: return KeyError("cancelled")
    case .biometryLockout: return KeyError("lockout")
    case .biometryNotEnrolled, .biometryNotAvailable, .passcodeNotSet: return KeyError("biometry_unavailable")
    case .notInteractive: return KeyError("interaction_not_allowed")
    default: return KeyError("failed")
    }
  }
}

/// What the native signer accepts, read from the bytes it signs rather than
/// from the caller: a v3 canonical string (eight LF-separated lines, the first
/// "tuturuuu-iris-device-v3"), and a fresh biometric prompt for any method but
/// GET/HEAD whatever the `sensitive` flag says. Mirrors `irisNativeMustPrompt`
/// in lib/features/mastermind/iris/data/request_signer.dart.
enum IrisSignPolicy {
  static let domain = "tuturuuu-iris-device-v3"

  /// True to prompt, false for the read session, nil to refuse to sign.
  static func mustPrompt(_ data: Data, sensitive: Bool) -> Bool? {
    guard let text = String(data: data, encoding: .utf8) else { return nil }
    let lines = text.split(separator: "\n", omittingEmptySubsequences: false)
    guard lines.count == 8, lines[0] == domain else { return nil }
    let method = String(lines[1])
    guard !method.isEmpty, method == method.uppercased() else { return nil }
    return sensitive || (method != "GET" && method != "HEAD")
  }
}

/// DER SubjectPublicKeyInfo prefix for an uncompressed P-256 point.
private let p256SpkiPrefix = Data([
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01,
    0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
])

private struct KeyError: Error {
  let code: String
  init(_ code: String) { self.code = code }
}

/// An account-scoped approval key. Its access control requires user presence
/// for each signature, with a fresh authentication context for every call.
final class MobileApprovalKeyPlugin: NSObject, FlutterPlugin {
  private let queue = DispatchQueue(label: "com.tuturuuu.mobile.approval-key")

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "mobile/approval_key", binaryMessenger: registrar.messenger())
    registrar.addMethodCallDelegate(MobileApprovalKeyPlugin(), channel: channel)
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "ensureKey" || call.method == "sign" else {
      result(FlutterMethodNotImplemented)
      return
    }
    guard let args = call.arguments as? [String: Any],
          let account = (args["accountId"] as? String).flatMap(UUID.init(uuidString:))
    else {
      result(Self.failure("bad_arguments"))
      return
    }
    queue.async {
      let value: Any
      do {
        guard SecureEnclave.isAvailable else { throw KeyError("unsupported") }
        let tag = Data("com.tuturuuu.mobile.approval-key.v2.\(account.uuidString.lowercased())".utf8)
        if call.method == "ensureKey" {
          value = try self.ensurePublicKey(tag: tag)
        } else {
          guard let data = (args["data"] as? FlutterStandardTypedData)?.data,
                Self.isApprovalMessage(data),
                let reason = args["reason"] as? String, !reason.isEmpty, reason.count <= 200
          else { throw KeyError("bad_arguments") }
          value = FlutterStandardTypedData(bytes: try self.sign(data, tag: tag, reason: reason))
        }
      } catch let error as KeyError {
        value = Self.failure(error.code)
      } catch {
        value = Self.failure("failed")
      }
      DispatchQueue.main.async { result(value) }
    }
  }

  private static func isApprovalMessage(_ data: Data) -> Bool {
    guard data.count <= 512,
          let fields = (try? JSONSerialization.jsonObject(with: data)) as? [String],
          fields.count == 8, fields.first == "tuturuuu.mobile-approval.v2"
    else { return false }
    return fields[1...4].allSatisfy { !$0.isEmpty }
  }

  private static func failure(_ code: String) -> FlutterError {
    FlutterError(code: code, message: "Mobile approval key unavailable", details: nil)
  }

  private func ensurePublicKey(tag: Data) throws -> FlutterStandardTypedData {
    let context = LAContext()
    context.interactionNotAllowed = true
    defer { context.invalidate() }
    let key = try findKey(tag: tag, context: context) ?? createKey(tag: tag)
    guard let publicKey = SecKeyCopyPublicKey(key),
          let point = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?,
          point.count == 65, point.first == 0x04
    else { throw KeyError("failed") }
    return FlutterStandardTypedData(bytes: p256SpkiPrefix + point)
  }

  private func findKey(tag: Data, context: LAContext) throws -> SecKey? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: tag,
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
      kSecUseAuthenticationContext as String: context,
      kSecReturnRef as String: true,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let item, CFGetTypeID(item) == SecKeyGetTypeID() else {
      throw KeyError(status == errSecUserCanceled ? "cancelled" : "failed")
    }
    return (item as! SecKey)
  }

  private func createKey(tag: Data) throws -> SecKey {
    guard LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil),
          let access = SecAccessControlCreateWithFlags(
            nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            [.privateKeyUsage, .userPresence], nil)
    else { throw KeyError("unsupported") }
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeySizeInBits as String: 256,
      kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
      kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: tag,
        kSecAttrAccessControl as String: access,
      ] as [String: Any],
    ]
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, nil)
    else { throw KeyError("failed") }
    return key
  }

  private func sign(_ data: Data, tag: Data, reason: String) throws -> Data {
    let context = LAContext()
    defer { context.invalidate() }
    context.touchIDAuthenticationAllowableReuseDuration = 0
    context.localizedReason = reason
    guard let key = try findKey(tag: tag, context: context) else { throw KeyError("no_key") }
    var error: Unmanaged<CFError>?
    guard let signature = SecKeyCreateSignature(
      key, .ecdsaSignatureMessageX962SHA256, data as CFData, &error) as Data?
    else {
      let code = error.map { ($0.takeRetainedValue() as Error as NSError).code }
      throw KeyError(code == Int(errSecUserCanceled) ? "cancelled" : "failed")
    }
    return signature
  }
}
