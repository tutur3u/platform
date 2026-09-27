import 'dart:convert';
import 'dart:math';

import 'package:cryptography/cryptography.dart';

const _lockKey = 'tuturuuuLock';
const _iterations = 150000;

Map<String, dynamic>? lockedNoteEnvelope(Map<String, dynamic> document) {
  final attrs = document['attrs'];
  if (attrs is! Map) return null;
  final envelope = attrs[_lockKey];
  if (envelope is! Map || envelope['version'] != 1) return null;
  return envelope.cast<String, dynamic>();
}

bool isDeviceLockedNote(Map<String, dynamic> document) =>
    lockedNoteEnvelope(document)?['mode'] == 'device';

Future<Map<String, dynamic>> encryptNoteDocument(
  Map<String, dynamic> document,
  String passphrase, {
  bool deviceOnly = false,
  String? recovery,
  String? lockId,
}) async {
  if (passphrase.isEmpty) throw ArgumentError('Passphrase is required');
  final random = Random.secure();
  final salt = List<int>.generate(16, (_) => random.nextInt(256));
  final nonce = List<int>.generate(12, (_) => random.nextInt(256));
  final key = await Pbkdf2(
    macAlgorithm: Hmac.sha256(),
    iterations: _iterations,
    bits: 256,
  ).deriveKeyFromPassword(password: passphrase, nonce: salt);
  final box = await AesGcm.with256bits().encrypt(
    utf8.encode(jsonEncode(document)),
    secretKey: key,
    nonce: nonce,
  );
  return {
    'type': 'doc',
    'attrs': {
      _lockKey: {
        'version': 1,
        if (deviceOnly) 'mode': 'device',
        if (lockId != null) 'lockId': lockId,
        if (recovery != null) 'recovery': recovery,
        'salt': base64Encode(salt),
        'nonce': base64Encode(nonce),
        // Web Crypto stores the authentication tag at the end of ciphertext.
        'ciphertext': base64Encode([...box.cipherText, ...box.mac.bytes]),
      },
    },
    'content': <Object>[],
  };
}

Future<Map<String, dynamic>> decryptNoteDocument(
  Map<String, dynamic> document,
  String passphrase,
) async {
  final envelope = lockedNoteEnvelope(document);
  if (envelope == null) throw const FormatException('Not a locked note');
  final salt = base64Decode(envelope['salt'] as String);
  final nonce = base64Decode(envelope['nonce'] as String);
  final combined = base64Decode(envelope['ciphertext'] as String);
  if (salt.length != 16 || nonce.length != 12 || combined.length < 16) {
    throw const FormatException('Invalid locked note');
  }
  final key = await Pbkdf2(
    macAlgorithm: Hmac.sha256(),
    iterations: _iterations,
    bits: 256,
  ).deriveKeyFromPassword(password: passphrase, nonce: salt);
  final plain = await AesGcm.with256bits().decrypt(
    SecretBox(
      combined.sublist(0, combined.length - 16),
      nonce: nonce,
      mac: Mac(combined.sublist(combined.length - 16)),
    ),
    secretKey: key,
  );
  final decoded = jsonDecode(utf8.decode(plain));
  if (decoded is! Map || decoded['type'] != 'doc') {
    throw const FormatException('Invalid note content');
  }
  return decoded.cast<String, dynamic>();
}
