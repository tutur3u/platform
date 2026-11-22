import CryptoKit
import Foundation

// mm-secret-hpke: the machine end of Mastermind secret entry's HPKE. It is
// a child of secret-request.mjs and holds the request's one-use X25519
// private key in its own memory only.
//
//   mm-secret-hpke version   prints {"protocol":"1"}; exits 69 below macOS 14
//   mm-secret-hpke serve     prints {"publicKey":"<b64url>"}, then reads one
//                            line {"enc","ct","aad"} (b64url) from stdin,
//                            opens it once, prints {"plaintext":"<b64url>"}
//                            or {"error":"open_failed"}, and exits. Standard
//                            input closing first ends it with nothing opened.
//
// The CryptoKit calls live in MastermindSecretCrypto.swift, shared with the
// iOS app. Build and self-test: build.sh, on a macOS 14 or later build host.

let maxInputBytes = 16 * 1024

func emit(_ object: [String: String]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  else { exit(70) }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data("\n".utf8))
}

func fail(_ code: String, status: Int32) -> Never {
  FileHandle.standardError.write(Data("mm-secret-hpke: \(code)\n".utf8))
  exit(status)
}

guard #available(macOS 14.0, *) else { fail("unsupported_os", status: 69) }

struct OpenInput: Decodable {
  let enc: String
  let ct: String
  let aad: String
}

@available(macOS 14.0, *)
func serve() -> Never {
  let key = Curve25519.KeyAgreement.PrivateKey()
  emit(["publicKey": MastermindSecretCrypto.b64url(key.publicKey.rawRepresentation)])
  guard let line = readLine(strippingNewline: true) else { exit(0) }
  guard line.utf8.count <= maxInputBytes,
    let input = try? JSONDecoder().decode(OpenInput.self, from: Data(line.utf8)),
    let enc = MastermindSecretCrypto.fromB64url(input.enc, length: 32),
    let ct = MastermindSecretCrypto.fromB64url(input.ct),
    let aad = MastermindSecretCrypto.fromB64url(input.aad)
  else {
    emit(["error": "bad_input"])
    exit(1)
  }
  guard var plaintext = try? MastermindSecretCrypto.open(privateKey: key, enc: enc, ct: ct, aad: aad)
  else {
    emit(["error": "open_failed"])
    exit(1)
  }
  emit(["plaintext": MastermindSecretCrypto.b64url(plaintext)])
  MastermindSecretCrypto.wipe(&plaintext)
  exit(0)
}

switch CommandLine.arguments.dropFirst().first {
case "version":
  emit(["protocol": MastermindSecretCrypto.protocolVersion])
case "serve":
  serve()
default:
  fail("usage", status: 64)
}
