import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/notes/note_transfer.dart';

void main() {
  test(
    'QR transfer is note-bound and seals the key for the web QR secret',
    () async {
      final key = List<int>.generate(32, (index) => index);
      final payload = NoteTransferPayload.parse(
        'tuturuuu://notes/transfer?wsId=workspace&noteId=note&id=00000000-0000-4000-8000-000000000001&key=${Uri.encodeQueryComponent(base64Encode(key))}&origin=https%3A%2F%2Ftuturuuu.com',
        wsId: 'workspace',
        noteId: 'note',
      );
      expect(payload, isNotNull);
      expect(
        NoteTransferPayload.parse(
          'tuturuuu://notes/transfer?wsId=workspace&noteId=other&id=00000000-0000-4000-8000-000000000001&key=${Uri.encodeQueryComponent(base64Encode(key))}&origin=https%3A%2F%2Ftuturuuu.com',
          wsId: 'workspace',
          noteId: 'note',
        ),
        isNull,
      );
      final sealed = base64Decode(await payload!.seal('private-note-key'));
      final plain = await AesGcm.with256bits().decrypt(
        SecretBox(
          sealed.sublist(12, sealed.length - 16),
          nonce: sealed.sublist(0, 12),
          mac: Mac(sealed.sublist(sealed.length - 16)),
        ),
        secretKey: SecretKey(key),
      );
      expect(utf8.decode(plain), 'private-note-key');
    },
  );
}
