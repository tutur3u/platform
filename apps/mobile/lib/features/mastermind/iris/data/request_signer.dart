import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

/// The first line of every device signature, so a key's signature over Iris
/// bytes can never be read as anything else.
const irisSignatureDomain = 'tuturuuu-iris-device-v3';

/// Whether [method] only reads: GET and HEAD sign with an empty
/// Idempotency-Key line and may use the read session.
bool irisIsReadMethod(String method) {
  final verb = method.toUpperCase();
  return verb == 'GET' || verb == 'HEAD';
}

final _uuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
);

/// The exact string a device signs, as the relay rebuilds it (v3): eight
/// lines joined by LF with no trailing LF. They are [irisSignatureDomain],
/// METHOD, the path with its query, sha256(body) as lowercase hex, Unix
/// seconds, nonce, device id (a lowercase UUID), and then the Idempotency-Key
/// (a lowercase UUID) for a write, or an empty line for GET/HEAD. A field
/// holding LF or CR, a write without a key, or a read with one is refused
/// with a [FormatException] before anything is signed.
String irisCanonicalRequest({
  required String method,
  required String path,
  required List<int> body,
  required String ts,
  required String nonce,
  required String deviceId,
  String? idempotencyKey,
}) {
  final verb = method.toUpperCase();
  for (final (name, value) in [
    ('method', verb),
    ('path', path),
    ('ts', ts),
    ('nonce', nonce),
    ('deviceId', deviceId),
    ('idempotencyKey', idempotencyKey ?? ''),
  ]) {
    if (value.contains('\n') || value.contains('\r')) {
      throw FormatException('$name holds a line break');
    }
  }
  if (!_uuid.hasMatch(deviceId)) {
    throw const FormatException('deviceId is not a lowercase UUID');
  }
  final read = irisIsReadMethod(verb);
  if (read ? idempotencyKey != null : !_uuid.hasMatch(idempotencyKey ?? '')) {
    throw const FormatException('idempotencyKey does not fit the method');
  }
  return [
    irisSignatureDomain,
    verb,
    path,
    sha256.convert(body).toString(),
    ts,
    nonce,
    deviceId,
    idempotencyKey ?? '',
  ].join('\n');
}

/// The native signer's gate, mirrored for tests: the bytes must be a v3
/// canonical string, and anything but GET/HEAD always prompts, whatever the
/// caller's `sensitive` flag says. Null when the native side refuses to sign.
/// Keep in step with `IrisSignPolicy` in IrisDeviceKey.swift and
/// IrisSignPolicy.kt.
bool? irisNativeMustPrompt(List<int> data, {required bool sensitive}) {
  final String text;
  try {
    text = utf8.decode(data);
  } on FormatException {
    return null;
  }
  final lines = text.split('\n');
  if (lines.length != 8 || lines[0] != irisSignatureDomain) return null;
  final method = lines[1];
  if (method.isEmpty || method != method.toUpperCase()) return null;
  return sensitive || !irisIsReadMethod(method);
}

/// A 128-bit random nonce as 32 hex characters.
String newIrisNonce([Random? random]) {
  final rng = random ?? Random.secure();
  return List<int>.generate(
    16,
    (_) => rng.nextInt(256),
  ).map((b) => b.toRadixString(16).padLeft(2, '0')).join();
}

/// A random (version 4) lowercase UUID for an Idempotency-Key.
String newIrisIdempotencyKey([Random? random]) {
  final rng = random ?? Random.secure();
  final b = List<int>.generate(16, (_) => rng.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final hex = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
