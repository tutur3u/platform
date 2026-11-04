import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String source(String path) => File(
  'lib/$path',
).readAsStringSync().replaceAll(RegExp(r'/\*[\s\S]*?\*/|//[^\n]*'), '');

void main() {
  test('only approved adapters construct raw secure storage', () {
    final constructors = <String>{};
    for (final file in Directory(
      'lib',
    ).listSync(recursive: true).whereType<File>()) {
      if (!file.path.endsWith('.dart')) continue;
      final path = file.path.substring(4);
      if (RegExp(r'\bFlutterSecureStorage\s*\(').hasMatch(source(path))) {
        constructors.add(path);
      }
    }
    expect(constructors, {
      'data/sources/secure_storage.dart',
      'features/security/device_mfa/device_mfa_service.dart',
      'features/notes/note_device_lock.dart',
    });
  });

  test('all seven migrated stores default to device storage', () {
    for (final path in [
      'core/cache/cache_store.dart',
      'features/security/data/app_lock_settings_store.dart',
      'data/sources/inventory_sale_journal.dart',
      'data/sources/native_integrity/native_integrity_platform.dart',
      'features/notes/voice/notes_voice_repository.dart',
      'features/profile/profile_timeline_repository.dart',
      'features/habits/cubit/habits_snapshot_access.dart',
    ]) {
      final text = source(path);
      expect(
        text,
        matches(RegExp(r'(\?\?|=)\s*deviceSecureStorage\b')),
        reason: path,
      );
      expect(
        text,
        isNot(
          matches(RegExp(r'\b(authSecureStorage|legacyAuthSecureStorage)\b')),
        ),
        reason: path,
      );
    }
  });

  test('device storage explicitly overrides bulk operations', () {
    final text = source('data/sources/device_secure_storage.dart');
    for (final method in ['readAll', 'deleteAll']) {
      expect(
        text,
        matches(RegExp('@override\\s+Future<[^;]+?\\b$method\\s*\\(')),
      );
    }
  });
}
