import 'dart:typed_data';
import 'package:crypto/crypto.dart';

/// RFC 6238 (SHA-1, six digits, 30 seconds), as used by Supabase TOTP.
String deviceTotp(String secret, DateTime time) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  final bytes = <int>[];
  var buffer = 0;
  var bits = 0;
  for (final char in secret.toUpperCase().replaceAll('=', '').split('')) {
    final value = alphabet.indexOf(char);
    if (value < 0) throw const FormatException('Invalid authenticator secret');
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.add((buffer >> bits) & 255);
      buffer &= (1 << bits) - 1;
    }
  }
  if (bytes.isEmpty) throw const FormatException('Empty authenticator secret');
  final counter = ByteData(8)
    ..setUint64(0, time.millisecondsSinceEpoch ~/ 30000);
  final digest = Hmac(sha1, bytes).convert(counter.buffer.asUint8List()).bytes;
  final offset = digest.last & 15;
  final value =
      ((digest[offset] & 127) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3];
  return (value % 1000000).toString().padLeft(6, '0');
}
