import 'dart:convert';
import 'dart:math';

import 'package:cryptography/cryptography.dart';
import 'package:mobile/features/security/qr_login/qr_login_payload.dart';

class NoteTransferPayload {
  const NoteTransferPayload({
    required this.wsId,
    required this.noteId,
    required this.id,
    required this.key,
    required this.origin,
  });

  final String wsId;
  final String noteId;
  final String id;
  final List<int> key;
  final Uri origin;

  static NoteTransferPayload? parse(
    String? value, {
    required String wsId,
    required String noteId,
  }) {
    final uri = Uri.tryParse(value ?? '');
    if (uri?.scheme != 'tuturuuu' ||
        uri?.host != 'notes' ||
        uri?.path != '/transfer' ||
        uri?.queryParameters['wsId'] != wsId ||
        uri?.queryParameters['noteId'] != noteId) {
      return null;
    }
    final id = uri!.queryParameters['id'];
    final rawKey = uri.queryParameters['key'];
    final origin = Uri.tryParse(uri.queryParameters['origin'] ?? '');
    if (id == null ||
        !RegExp(
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-'
          r'[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
        ).hasMatch(id) ||
        rawKey == null ||
        origin == null ||
        !isTrustedQrLoginOrigin(origin)) {
      return null;
    }
    try {
      final key = base64Decode(rawKey);
      if (key.length != 32) return null;
      return NoteTransferPayload(
        wsId: wsId,
        noteId: noteId,
        id: id,
        key: key,
        origin: origin,
      );
    } on FormatException {
      return null;
    }
  }

  Future<String> seal(String secret) async {
    final random = Random.secure();
    final nonce = List<int>.generate(12, (_) => random.nextInt(256));
    final box = await AesGcm.with256bits().encrypt(
      utf8.encode(secret),
      secretKey: SecretKey(key),
      nonce: nonce,
    );
    return base64Encode([...nonce, ...box.cipherText, ...box.mac.bytes]);
  }
}
