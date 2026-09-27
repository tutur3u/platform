import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/notes/note_device_lock.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _LocalAuth extends Mock implements LocalAuthService {}

void main() {
  late _Storage storage;
  late _LocalAuth localAuth;
  late Map<String, String> saved;
  late DateTime now;
  late NoteDeviceLockService service;

  setUp(() {
    storage = _Storage();
    localAuth = _LocalAuth();
    saved = {};
    now = DateTime.utc(2026, 9, 27);
    when(() => storage.read(key: any(named: 'key'))).thenAnswer(
      (invocation) async => saved[invocation.namedArguments[#key] as String],
    );
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((invocation) async {
      saved[invocation.namedArguments[#key] as String] =
          invocation.namedArguments[#value] as String;
    });
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((
      invocation,
    ) async {
      saved.remove(invocation.namedArguments[#key] as String);
    });
    service = NoteDeviceLockService(
      storage: storage,
      localAuth: localAuth,
      userId: () => 'user-a',
      now: () => now,
    );
  });

  test(
    'biometric lock gates a random secret on this account and device',
    () async {
      final secret = service.createSecret();
      await service.save('workspace', 'note', secret, lockId: 'lock-1');
      expect(
        await service.method('workspace', 'note', lockId: 'lock-1'),
        NoteDeviceLockMethod.biometrics,
      );
      expect(
        await service.method('workspace', 'note', lockId: 'other-lock'),
        isNull,
      );
      when(
        () => localAuth.authenticate(reason: 'Open note'),
      ).thenAnswer((_) async => false);
      expect(
        await service.unlock(
          'workspace',
          'note',
          lockId: 'lock-1',
          reason: 'Open note',
        ),
        isNull,
      );
      when(
        () => localAuth.authenticate(reason: 'Open note'),
      ).thenAnswer((_) async => true);
      expect(
        await service.unlock(
          'workspace',
          'note',
          lockId: 'lock-1',
          reason: 'Open note',
        ),
        secret,
      );
      final otherAccount = NoteDeviceLockService(
        storage: storage,
        localAuth: localAuth,
        userId: () => 'user-b',
      );
      expect(
        await otherAccount.method('workspace', 'note', lockId: 'lock-1'),
        isNull,
      );
    },
  );

  test(
    'six-digit PIN never becomes the encryption secret and pauses retries',
    () async {
      final secret = service.createSecret();
      await service.save(
        'workspace',
        'note',
        secret,
        lockId: 'lock-1',
        pin: '123456',
      );
      expect(
        await service.method('workspace', 'note', lockId: 'lock-1'),
        NoteDeviceLockMethod.pin,
      );
      expect(saved.values.single, isNot(contains('123456')));
      for (var attempt = 0; attempt < 5; attempt++) {
        expect(
          await service.unlock(
            'workspace',
            'note',
            lockId: 'lock-1',
            pin: '000000',
            reason: 'Open note',
          ),
          isNull,
        );
      }
      expect(
        await service.unlock(
          'workspace',
          'note',
          lockId: 'lock-1',
          pin: '123456',
          reason: 'Open note',
        ),
        isNull,
      );
      now = now.add(const Duration(seconds: 31));
      expect(
        await service.unlock(
          'workspace',
          'note',
          lockId: 'lock-1',
          pin: '123456',
          reason: 'Open note',
        ),
        secret,
      );
      await service.delete('workspace', 'note');
      expect(
        await service.method('workspace', 'note', lockId: 'lock-1'),
        isNull,
      );
    },
  );
}
