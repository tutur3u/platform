import CryptoKit
import Foundation

/// Mastermind secret entry, protocol v1: every CryptoKit call both ends make.
///
/// This one file is compiled into the iOS app (behind
/// `MastermindSecretPlugin`) and into the macOS helper `mm-secret-hpke`
/// (`scripts/mastermind-fleet/secret-hpke/`), so the phone's `HPKE.Sender`
/// and the machine's `HPKE.Recipient` are the same CryptoKit code. It must
/// not import Flutter. Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
@available(iOS 17.0, macOS 14.0, *)
enum MastermindSecretCrypto {
  static let protocolVersion = "1"
  static let hpkeInfo = Data("tuturuuu-mm-secret-v1".utf8)
  static let suite = HPKE.Ciphersuite.Curve25519_SHA256_ChachaPoly
  /// 17 blocks of 256 bytes plus the 16-byte tag.
  static let maxCiphertextBytes = 17 * 256 + 16

  enum Failure: Error {
    case badKey
    case badInput
    case openFailed
  }

  /// HPKE base mode `Seal` (sequence 0) to a raw X25519 public key.
  static func seal(
    recipientPublicKey: Data,
    aad: Data,
    plaintext: Data,
    info: Data = hpkeInfo
  ) throws -> (enc: Data, ct: Data) {
    guard recipientPublicKey.count == 32 else { throw Failure.badKey }
    let key: Curve25519.KeyAgreement.PublicKey
    do {
      key = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: recipientPublicKey)
    } catch {
      throw Failure.badKey
    }
    var sender = try HPKE.Sender(recipientKey: key, ciphersuite: suite, info: info)
    let ct = try sender.seal(plaintext, authenticating: aad)
    return (sender.encapsulatedKey, ct)
  }

  /// HPKE base mode `Open` (sequence 0). Throws on any change to `enc`, the
  /// ciphertext, its tag, the AAD or `info`, or with the wrong key.
  static func open(
    privateKey: Curve25519.KeyAgreement.PrivateKey,
    enc: Data,
    ct: Data,
    aad: Data,
    info: Data = hpkeInfo
  ) throws -> Data {
    guard enc.count == 32, ct.count >= 16, ct.count <= maxCiphertextBytes else {
      throw Failure.badInput
    }
    do {
      var recipient = try HPKE.Recipient(
        privateKey: privateKey,
        ciphersuite: suite,
        info: info,
        encapsulatedKey: enc
      )
      return try recipient.open(ct, authenticating: aad)
    } catch {
      throw Failure.openFailed
    }
  }

  static func verifyEd25519(publicKey: Data, message: Data, signature: Data) -> Bool {
    guard publicKey.count == 32, signature.count == 64,
      let key = try? Curve25519.Signing.PublicKey(rawRepresentation: publicKey)
    else { return false }
    return key.isValidSignature(signature, for: message)
  }

  static func hkdfSha256(ikm: Data, salt: Data, info: Data, count: Int) -> Data {
    let key = HKDF<SHA256>.deriveKey(
      inputKeyMaterial: SymmetricKey(data: ikm),
      salt: salt,
      info: info,
      outputByteCount: count
    )
    return key.withUnsafeBytes { Data($0) }
  }

  static func hmacSha256(key: Data, message: Data) -> Data {
    Data(HMAC<SHA256>.authenticationCode(for: message, using: SymmetricKey(data: key)))
  }

  /// Compares two MACs without an early exit.
  static func constantTimeEqual(_ a: Data, _ b: Data) -> Bool {
    guard a.count == b.count else { return false }
    var difference: UInt8 = 0
    for (x, y) in zip(a, b) { difference |= x ^ y }
    return difference == 0
  }

  /// Unpadded base64url.
  static func b64url(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  /// Canonical unpadded base64url of exactly `length` bytes, or nil.
  static func fromB64url(_ text: String, length: Int? = nil) -> Data? {
    let allowed = CharacterSet(
      charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
    guard text.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return nil }
    var standard = text.replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while standard.count % 4 != 0 { standard += "=" }
    guard let data = Data(base64Encoded: standard) else { return nil }
    if let length, data.count != length { return nil }
    return b64url(data) == text ? data : nil
  }

  /// Overwrites a buffer that held key material or a plaintext.
  static func wipe(_ data: inout Data) {
    data.resetBytes(in: 0..<data.count)
  }
}
