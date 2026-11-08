import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/iris/data/request_signer.dart';
import 'package:mobile/features/mastermind/iris/device/iris_key_codec.dart';
import 'package:pointycastle/export.dart';

/// Forge's published v3 device-signature vectors (GET and POST), public
/// parts only: the relay's fields, canonical string, signatures and SPKI.
/// The app must build the same bytes, and the relay's signatures must verify
/// over them with the public key alone.
const _vectorsPath = 'test/fixtures/iris/iris_device_vectors.json';

typedef _Vector = Map<String, dynamic>;

List<_Vector> _vectors() =>
    (jsonDecode(File(_vectorsPath).readAsStringSync()) as List).cast<_Vector>();

String _canonical(_Vector v) {
  final f = v['fields'] as Map<String, dynamic>;
  final key = f['idempotencyKey'] as String;
  return irisCanonicalRequest(
    method: f['method'] as String,
    path: f['path'] as String,
    body: utf8.encode(v['body'] as String),
    ts: f['ts'] as String,
    nonce: f['nonce'] as String,
    deviceId: f['deviceId'] as String,
    idempotencyKey: key.isEmpty ? null : key,
  );
}

BigInt _int(List<int> bytes) =>
    bytes.fold(BigInt.zero, (value, byte) => (value << 8) | BigInt.from(byte));

/// ECDSA P-256 / SHA-256 over [message] with the raw r||s [signature].
bool _verifies(String spkiBase64Url, List<int> message, Uint8List signature) {
  final spki = base64Url.decode(base64Url.normalize(spkiBase64Url));
  final domain = ECDomainParameters('secp256r1');
  final point = domain.curve.decodePoint(spki.sublist(spki.length - 65));
  final verifier = ECDSASigner(SHA256Digest())
    ..init(false, PublicKeyParameter(ECPublicKey(point, domain)));
  return verifier.verifySignature(
    Uint8List.fromList(message),
    ECSignature(_int(signature.sublist(0, 32)), _int(signature.sublist(32))),
  );
}

void main() {
  final vectors = _vectors();

  test('there is one GET and one POST vector', () {
    expect(vectors.map((v) => (v['fields'] as Map)['method']), ['GET', 'POST']);
  });

  for (final v in vectors) {
    final method = (v['fields'] as Map)['method'] as String;

    group(method, () {
      test('the app builds the exact canonical string', () {
        final canonical = _canonical(v);
        expect(canonical, v['canonical']);
        expect(
          sha256.convert(utf8.encode(canonical)).toString(),
          v['canonical_sha256'],
        );
        expect(
          sha256.convert(utf8.encode(v['body'] as String)).toString(),
          (v['fields'] as Map)['bodyHash'],
        );
      });

      test('the SPKI is the P-256 form the app enrols', () {
        final spki = base64Url.decode(
          base64Url.normalize(v['spki_base64url'] as String),
        );
        expect(isP256Spki(spki), isTrue);
        expect(irisBase64Url(spki), v['spki_base64url']);
      });

      test('the raw r||s signature (what the app sends) verifies', () {
        final raw = base64.decode(v['raw_base64'] as String);
        expect(raw, hasLength(64));
        final canonical = utf8.encode(_canonical(v));
        expect(
          _verifies(v['spki_base64url'] as String, canonical, raw),
          isTrue,
        );
        // The header carries the same bytes as unpadded base64url.
        final header = irisBase64Url(raw);
        expect(header, isNot(contains('=')));
        expect(base64Url.decode(base64Url.normalize(header)), raw);
      });

      test('a native DER signature converts to raw and verifies', () {
        final raw = irisRawSignature(base64.decode(v['der_base64'] as String));
        expect(raw, isNotNull);
        expect(
          _verifies(
            v['spki_base64url'] as String,
            utf8.encode(_canonical(v)),
            raw!,
          ),
          isTrue,
        );
      });

      test('a changed canonical string does not verify', () {
        final raw = base64.decode(v['raw_base64'] as String);
        final tampered = utf8.encode('${_canonical(v)}x');
        expect(
          _verifies(v['spki_base64url'] as String, tampered, raw),
          isFalse,
        );
      });

      test('the native gate reads the method from the signed bytes', () {
        final bytes = utf8.encode(v['canonical'] as String);
        expect(irisNativeMustPrompt(bytes, sensitive: false), method == 'POST');
      });
    });
  }
}
