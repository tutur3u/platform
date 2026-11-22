import Foundation

// Test-only stand-in for the phone: seals with the same
// MastermindSecretCrypto.seal the iOS plugin calls. Reads one JSON line
// {"publicKey","aad","plaintext"} (b64url) and prints {"enc","ct"}.
// Built by build.sh as mm-secret-seal-test; never installed on a fleet Mac.

@main
struct SealTool {
  struct Input: Decodable {
    let publicKey: String
    let aad: String
    let plaintext: String
  }

  static func main() {
    guard #available(macOS 14.0, *) else { exit(69) }
    guard let line = readLine(),
      let input = try? JSONDecoder().decode(Input.self, from: Data(line.utf8)),
      let key = MastermindSecretCrypto.fromB64url(input.publicKey, length: 32),
      let aad = MastermindSecretCrypto.fromB64url(input.aad),
      let plaintext = MastermindSecretCrypto.fromB64url(input.plaintext),
      let sealed = try? MastermindSecretCrypto.seal(
        recipientPublicKey: key, aad: aad, plaintext: plaintext)
    else { exit(1) }
    print(
      "{\"enc\":\"\(MastermindSecretCrypto.b64url(sealed.enc))\",\"ct\":\"\(MastermindSecretCrypto.b64url(sealed.ct))\"}"
    )
  }
}
