import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

/// DER SubjectPublicKeyInfo prefix for an uncompressed P-256 point
/// (id-ecPublicKey, prime256v1, 65-byte BIT STRING).
const List<int> _p256SpkiPrefix = [
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, //
  0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03,
  0x42, 0x00,
];

/// Whether [spki] is exactly a P-256 SubjectPublicKeyInfo with an
/// uncompressed point, the only form the relay imports.
bool isP256Spki(List<int> spki) {
  if (spki.length != _p256SpkiPrefix.length + 65) return false;
  for (var i = 0; i < _p256SpkiPrefix.length; i++) {
    if (spki[i] != _p256SpkiPrefix[i]) return false;
  }
  return spki[_p256SpkiPrefix.length] == 0x04;
}

/// Unpadded base64url, the relay's encoding for keys and signatures.
String irisBase64Url(List<int> bytes) =>
    base64Url.encode(bytes).replaceAll('=', '');

/// The device id the relay files this key under: the first 16 bytes of the
/// key fingerprint as a lowercase UUID (version 8, RFC 9562 variant). It is
/// tied to the key, so a new key is a new device and needs no storage.
String irisDeviceIdFor(String fingerprint) {
  if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(fingerprint)) {
    throw ArgumentError.value(fingerprint, 'fingerprint');
  }
  final b = [
    for (var i = 0; i < 32; i += 2)
      int.parse(fingerprint.substring(i, i + 2), radix: 16),
  ];
  b[6] = (b[6] & 0x0f) | 0x80;
  b[8] = (b[8] & 0x3f) | 0x80;
  final hex = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// A fresh 6-digit enrolment code, uniform over 000000-999999.
String newIrisEnrolCode([Random? random]) =>
    (random ?? Random.secure()).nextInt(1000000).toString().padLeft(6, '0');

/// The 64-byte r||s form of a strict DER ECDSA P-256 signature, or null
/// when [der] is not one (long-form lengths, non-minimal or negative
/// integers, trailing bytes). The relay accepts either form; raw is
/// unambiguous.
Uint8List? irisRawSignature(List<int> der) {
  if (der.length < 8 || der.length > 72) return null;
  if (der[0] != 0x30 || der[1] != der.length - 2) return null;
  final raw = Uint8List(64);
  var offset = 2;
  for (var part = 0; part < 2; part++) {
    if (offset + 2 > der.length || der[offset++] != 0x02) return null;
    final length = der[offset++];
    if (length < 1 || length > 33 || offset + length > der.length) return null;
    var integer = der.sublist(offset, offset + length);
    offset += length;
    if (integer[0] & 0x80 != 0) return null;
    if (integer.length > 1 && integer[0] == 0 && integer[1] & 0x80 == 0) {
      return null;
    }
    if (integer.length == 33) {
      if (integer[0] != 0) return null;
      integer = integer.sublist(1);
    }
    raw.setRange(part * 32 + 32 - integer.length, part * 32 + 32, integer);
  }
  return offset == der.length ? raw : null;
}
