import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';

/// The exact bytes a device signs (Forge v0): one field per line, in order.
/// The native signer must produce the same string.
String irisCanonicalRequest({
  required String method,
  required String path,
  required List<int> body,
  required String ts,
  required String nonce,
  required String deviceId,
  String? idempotencyKey,
}) => [
  method.toUpperCase(),
  path,
  sha256.convert(body).toString(),
  ts,
  nonce,
  deviceId,
  idempotencyKey ?? '',
].join('\n');

/// A 128-bit random nonce as 32 hex characters.
String newIrisNonce([Random? random]) {
  final rng = random ?? Random.secure();
  return List<int>.generate(
    16,
    (_) => rng.nextInt(256),
  ).map((b) => b.toRadixString(16).padLeft(2, '0')).join();
}

/// Stand-in until the native device key lands: the same headers and canonical
/// string, but the "signature" is a sha256 of it, not a P-256 signature. A
/// real relay rejects it, which is the point: it only serves fixture builds
/// and tests.
final class FakeIrisRequestSigner implements IrisRequestSigner {
  FakeIrisRequestSigner({
    this.deviceId = 'dev-fake-device',
    DateTime Function()? clock,
    Random? random,
  }) : _clock = clock ?? DateTime.now,
       _random = random;

  final String deviceId;
  final DateTime Function() _clock;
  final Random? _random;

  @override
  Future<Map<String, String>> sign(
    String method,
    String path,
    List<int> body, {
    String? idempotencyKey,
  }) async {
    final ts = '${_clock().toUtc().millisecondsSinceEpoch ~/ 1000}';
    final nonce = newIrisNonce(_random);
    final canonical = irisCanonicalRequest(
      method: method,
      path: path,
      body: body,
      ts: ts,
      nonce: nonce,
      deviceId: deviceId,
      idempotencyKey: idempotencyKey,
    );
    return {
      IrisHeaders.device: deviceId,
      IrisHeaders.ts: ts,
      IrisHeaders.nonce: nonce,
      IrisHeaders.sig: sha256.convert(utf8.encode(canonical)).toString(),
    };
  }
}
