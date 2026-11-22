import CryptoKit
import Foundation

// Self-test of the CryptoKit code both ends ship (MastermindSecretCrypto):
// RFC 9180 A.2.1 vectors opened by CryptoKit, seal and open round trips,
// tampering, malformed and small-order keys, and the shared fixture's
// signatures and pairing values. Built and run by build.sh.

@available(macOS 14.0, *)
struct SelfTest {
  var passed = 0
  var failed: [String] = []

  mutating func check(_ name: String, _ condition: Bool) {
    if condition { passed += 1 } else { failed.append(name) }
  }

  mutating func throwsError(_ name: String, _ body: () throws -> Void) {
    do {
      try body()
      failed.append(name)
    } catch {
      passed += 1
    }
  }
}

func hex(_ text: String) -> Data {
  var data = Data()
  var index = text.startIndex
  while index < text.endIndex {
    let next = text.index(index, offsetBy: 2)
    data.append(UInt8(text[index..<next], radix: 16)!)
    index = next
  }
  return data
}

func flip(_ data: Data, _ at: Int) -> Data {
  var copy = data
  copy[copy.startIndex + at] ^= 0x01
  return copy
}

@main
struct Main {
  static func main() throws {
    guard #available(macOS 14.0, *) else {
      FileHandle.standardError.write(Data("selftest: needs macOS 14\n".utf8))
      exit(69)
    }
    var t = SelfTest()
    let crypto = MastermindSecretCrypto.self

    // RFC 9180 A.2.1, base mode, copied from the RFC text.
    let info = hex("4f6465206f6e2061204772656369616e2055726e")
    let skRm = try Curve25519.KeyAgreement.PrivateKey(
      rawRepresentation: hex("8057991eef8f1f1af18f4a9491d16a1ce333f695d4db8e38da75975c4478e0fb"))
    let pkRm = hex("4310ee97d88cc1f088a5576c77ab0cf5c3ac797f3d95139c6c84b5429c59662a")
    let enc = hex("1afa08d3dec047a643885163f1180476fa7ddb54c6a8029ea33f95796bf2ac4a")
    let pt = hex("4265617574792069732074727574682c20747275746820626561757479")
    let aad0 = hex("436f756e742d30")
    let ct0 = hex(
      "1c5250d8034ec2b784ba2cfd69dbdb8af406cfe3ff938e131f0def8c8b60b4db21993c62ce81883d2dd1b51a28")
    let ct1 = hex(
      "6b53c051e4199c518de79594e1c4ab18b96f081549d45ce015be002090bb119e85285337cc95ba5f59992dc98c")
    t.check("rfc public key", skRm.publicKey.rawRepresentation == pkRm)
    t.check(
      "rfc open seq 0",
      (try? crypto.open(privateKey: skRm, enc: enc, ct: ct0, aad: aad0, info: info)) == pt)
    var recipient = try HPKE.Recipient(
      privateKey: skRm, ciphersuite: crypto.suite, info: info, encapsulatedKey: enc)
    t.check("rfc context seq 0", (try? recipient.open(ct0, authenticating: aad0)) == pt)
    t.check(
      "rfc context seq 1",
      (try? recipient.open(ct1, authenticating: hex("436f756e742d31"))) == pt)

    let tampering: [(String, () throws -> Void)] = [
      ("rfc tampered ct", { () throws in
        _ = try crypto.open(privateKey: skRm, enc: enc, ct: flip(ct0, 0), aad: aad0, info: info)
      }),
      ("rfc tampered tag", { () throws in
        _ = try crypto.open(
          privateKey: skRm, enc: enc, ct: flip(ct0, ct0.count - 1), aad: aad0, info: info)
      }),
      ("rfc tampered enc", { () throws in
        _ = try crypto.open(privateKey: skRm, enc: flip(enc, 3), ct: ct0, aad: aad0, info: info)
      }),
      ("rfc wrong aad", { () throws in
        _ = try crypto.open(privateKey: skRm, enc: enc, ct: ct0, aad: Data("x".utf8), info: info)
      }),
      ("rfc wrong info", { () throws in
        _ = try crypto.open(privateKey: skRm, enc: enc, ct: ct0, aad: aad0)
      }),
      ("rfc short enc", { () throws in
        _ = try crypto.open(privateKey: skRm, enc: enc.prefix(31), ct: ct0, aad: aad0, info: info)
      }),
    ]
    for (name, change) in tampering {
      t.throwsError(name, change)
    }

    // Round trip with the protocol's own info, and the wrong key.
    let key = Curve25519.KeyAgreement.PrivateKey()
    let aad = Data("binding".utf8)
    let message = Data(repeating: 0x5a, count: 256)
    let sealed = try crypto.seal(
      recipientPublicKey: key.publicKey.rawRepresentation, aad: aad, plaintext: message)
    t.check("seal enc length", sealed.enc.count == 32)
    t.check("seal ct length", sealed.ct.count == 256 + 16)
    t.check(
      "round trip",
      (try? crypto.open(privateKey: key, enc: sealed.enc, ct: sealed.ct, aad: aad)) == message)
    t.throwsError("wrong key") {
      _ = try crypto.open(
        privateKey: Curve25519.KeyAgreement.PrivateKey(), enc: sealed.enc, ct: sealed.ct, aad: aad)
    }
    let second = try crypto.seal(
      recipientPublicKey: key.publicKey.rawRepresentation, aad: aad, plaintext: message)
    t.check("fresh ephemeral per seal", second.enc != sealed.enc)

    t.throwsError("short recipient key") {
      _ = try crypto.seal(recipientPublicKey: Data(count: 31), aad: aad, plaintext: message)
    }
    t.throwsError("small-order recipient key") {
      _ = try crypto.seal(recipientPublicKey: Data(count: 32), aad: aad, plaintext: message)
    }
    t.throwsError("oversized ciphertext") {
      _ = try crypto.open(
        privateKey: key, enc: sealed.enc, ct: Data(count: crypto.maxCiphertextBytes + 1), aad: aad)
    }

    // The shared fixture (secret-fixture.json).
    let path = CommandLine.arguments.dropFirst().first ?? "secret-fixture.json"
    let fixture =
      try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path)))
      as! [String: Any]
    let request = fixture["request"] as! [String: String]
    let pairing = fixture["pairing"] as! [String: String]
    let outcome = fixture["outcome"] as! [String: String]
    let signer = crypto.fromB64url(request["signerKey"]!, length: 32)!
    let owner = crypto.fromB64url(fixture["ownerKey"] as! String, length: 32)!
    let requestBinding = hex(fixture["requestBindingHex"] as! String)
    let requestSig = crypto.fromB64url(fixture["requestSig"] as! String, length: 64)!
    t.check(
      "fixture request signature",
      crypto.verifyEd25519(publicKey: signer, message: requestBinding, signature: requestSig))
    t.check(
      "fixture request signature tampered",
      !crypto.verifyEd25519(
        publicKey: signer, message: flip(requestBinding, 40), signature: requestSig))
    t.check(
      "fixture owner signature",
      crypto.verifyEd25519(
        publicKey: owner, message: hex(fixture["ownerTranscriptHex"] as! String),
        signature: crypto.fromB64url(fixture["ownerSig"] as! String, length: 64)!))
    t.check(
      "fixture owner signature is not the machine's",
      !crypto.verifyEd25519(
        publicKey: signer, message: hex(fixture["ownerTranscriptHex"] as! String),
        signature: crypto.fromB64url(fixture["ownerSig"] as! String, length: 64)!))
    t.check(
      "fixture outcome signature",
      crypto.verifyEd25519(
        publicKey: signer, message: hex(outcome["bytesHex"]!),
        signature: crypto.fromB64url(outcome["sig"]!, length: 64)!))

    let pairKey = crypto.hkdfSha256(
      ikm: hex(pairing["codeHex"]!), salt: Data(pairing["pairingId"]!.utf8),
      info: Data("tuturuuu-mm-secret-pair-v1".utf8), count: 32)
    t.check("fixture pairing key", pairKey == hex(pairing["keyHex"]!))
    t.check(
      "constant-time compare",
      crypto.constantTimeEqual(pairKey, hex(pairing["keyHex"]!))
        && !crypto.constantTimeEqual(pairKey, flip(pairKey, 0))
        && !crypto.constantTimeEqual(pairKey, pairKey.prefix(31)))

    // base64url is canonical: a sibling spelling of the same bytes is refused.
    let text = request["publicKey"]!
    t.check("b64url round trip", crypto.b64url(crypto.fromB64url(text, length: 32)!) == text)
    t.check("b64url length", crypto.fromB64url(text, length: 31) == nil)
    t.check("b64url padding refused", crypto.fromB64url(text + "=", length: 32) == nil)
    let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
    let last = alphabet.firstIndex(of: text.last!)!
    let sibling = String(text.dropLast()) + String(alphabet[(last & ~3) | ((last + 1) & 3)])
    t.check("b64url non-canonical refused", crypto.fromB64url(sibling, length: 32) == nil)

    if t.failed.isEmpty {
      print("selftest: \(t.passed) passed")
    } else {
      print("selftest: \(t.passed) passed, \(t.failed.count) failed: \(t.failed.joined(separator: ", "))")
      exit(1)
    }
  }
}
