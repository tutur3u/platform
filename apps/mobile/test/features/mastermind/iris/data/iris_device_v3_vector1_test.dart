import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/iris/data/request_signer.dart';
import 'package:pointycastle/export.dart';

/// Forge's shared v3 vector 1 (test-only key, public parts only). ECDSA is
/// randomized, so the signature is verified, never compared with a fresh one.
const _path = 'test/fixtures/iris/iris-device-v3-vector1.json';

Uint8List _b64(String s) => base64Url.decode(base64Url.normalize(s));

BigInt _int(List<int> bytes) =>
    bytes.fold(BigInt.zero, (v, b) => (v << 8) | BigInt.from(b));

void main() {
  final v = jsonDecode(File(_path).readAsStringSync()) as Map<String, dynamic>;
  final i = v['inputs'] as Map<String, dynamic>;

  String canonical() => irisCanonicalRequest(
    method: i['method'] as String,
    path: i['path'] as String,
    body: utf8.encode(i['body'] as String),
    ts: i['ts'] as String,
    nonce: i['nonce'] as String,
    deviceId: i['deviceId'] as String,
    idempotencyKey: i['idempotencyKey'] as String,
  );

  test('the app builds the exact canonical bytes and hash', () {
    final built = canonical();
    expect(built, v['canonical']);
    expect(utf8.encode(built), utf8.encode(v['canonical'] as String));
    expect(
      sha256.convert(utf8.encode(i['body'] as String)).toString(),
      v['body_sha256_hex'],
    );
    expect(
      sha256.convert(utf8.encode(built)).toString(),
      v['canonical_sha256_hex'],
    );
  });

  test('sig_raw_b64url verifies against the public key', () {
    final sig = _b64(v['sig_raw_b64url'] as String);
    expect(sig, hasLength(64));
    final spki = _b64(v['public_key_spki_b64url'] as String);
    final domain = ECDomainParameters('secp256r1');
    final point = domain.curve.decodePoint(spki.sublist(spki.length - 65));
    final verifier = ECDSASigner(SHA256Digest())
      ..init(false, PublicKeyParameter(ECPublicKey(point, domain)));
    final message = Uint8List.fromList(utf8.encode(canonical()));
    final signature = ECSignature(
      _int(sig.sublist(0, 32)),
      _int(sig.sublist(32)),
    );
    expect(verifier.verifySignature(message, signature), isTrue);
    expect(
      verifier.verifySignature(
        Uint8List.fromList([...message, 0x78]),
        signature,
      ),
      isFalse,
    );
  });
}
