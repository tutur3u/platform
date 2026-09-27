import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/notes/note_lock_crypto.dart';

void main() {
  const document = <String, dynamic>{
    'type': 'doc',
    'content': [
      {
        'type': 'paragraph',
        'content': [
          {'type': 'text', 'text': 'A private note'},
        ],
      },
    ],
  };

  test(
    'encrypted notes contain no plaintext and decrypt with the passphrase',
    () async {
      final encrypted = await encryptNoteDocument(document, 'long passphrase');
      expect(lockedNoteEnvelope(encrypted), isNotNull);
      expect(encrypted.toString(), isNot(contains('A private note')));
      expect(await decryptNoteDocument(encrypted, 'long passphrase'), document);
      await expectLater(
        decryptNoteDocument(encrypted, 'incorrect passphrase'),
        throwsA(isA<Exception>()),
      );
    },
  );

  test('decrypts the shared AES-GCM note format', () async {
    final result = await decryptNoteDocument(const {
      'type': 'doc',
      'attrs': {
        'tuturuuuLock': {
          'version': 1,
          'salt': 'AQEBAQEBAQEBAQEBAQEBAQ==',
          'nonce': 'AgICAgICAgICAgIC',
          'ciphertext': '/kMAh5+gt8brz9XhQZhiqzUM29XOUDy1UJ607nmVAmBNcA2BHBFzMbKzWZ/1Pa5/MFN3l89npJwP9/sUg5xEtHyDG2ixX+MQnjZGvJcAM7phTUjNjbxDgqSmNabFIqEKoo44usycRQghvu5B0+g97WW8fg==',
        },
      },
      'content': <Object>[],
    }, 'shared-passphrase');
    expect(result['type'], 'doc');
    expect(result.toString(), contains('Cross platform'));
  });
}
