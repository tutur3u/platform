import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/device_secure_storage.dart';
import 'package:mobile/data/sources/keychain_accessibility_migration.dart';
import 'package:mobile/data/sources/secure_storage.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

typedef _Item = ({String value, String accessibility});

/// Models the iOS keychain: an item is only visible to the accessibility class
/// it was written under, deleting removes it for every class, and writing a
/// different class over an existing item fails with `errSecDuplicateItem`, as
/// `flutter_secure_storage_darwin` does.
class _Keychain {
  final items = <String, _Item>{};
  final failReads = <String>{};
  final failWriteKeys = <String>{};
  bool failWrites = false;

  /// Simulates the process being killed: once an operation matching this
  /// `<op>:<key>` has completed, every later call throws until [restart].
  String? crashAfter;
  bool dead = false;

  void restart() {
    crashAfter = null;
    dead = false;
  }

  void _guard() {
    if (dead) throw PlatformException(code: 'killed');
  }

  void _completed(String operation, String key) {
    if (crashAfter == '$operation:$key') {
      dead = true;
      throw PlatformException(code: 'killed');
    }
  }

  FlutterSecureStorage storage(String accessibility) {
    final storage = _MockFlutterSecureStorage();
    when(() => storage.read(key: any(named: 'key'))).thenAnswer((call) async {
      _guard();
      final key = call.namedArguments[#key] as String;
      if (accessibility == _legacy && failReads.contains(key)) {
        throw PlatformException(code: 'locked');
      }
      final item = items[key];
      return item?.accessibility == accessibility ? item!.value : null;
    });
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      _guard();
      final key = call.namedArguments[#key] as String;
      if (accessibility == _current &&
          (failWrites || failWriteKeys.contains(key))) {
        throw PlatformException(code: 'write-failed');
      }
      final existing = items[key];
      if (existing != null && existing.accessibility != accessibility) {
        throw PlatformException(
          code: 'Unexpected security result code',
          message: 'The specified item already exists in the keychain.',
          details: -25299,
        );
      }
      items[key] = (
        value: call.namedArguments[#value] as String,
        accessibility: accessibility,
      );
      _completed('write', key);
    });
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((call) async {
      _guard();
      final key = call.namedArguments[#key] as String;
      items.remove(key);
      _completed('delete', key);
    });
    return storage;
  }
}

const _legacy = 'unlocked';
const _current = 'first_unlock_this_device';

void main() {
  late _Keychain keychain;
  late FlutterSecureStorage legacy;
  late FlutterSecureStorage current;

  Future<bool> migrate({bool enabled = true}) =>
      migrateAuthKeychainAccessibility(
        current: current,
        legacy: legacy,
        keys: const ['session', 'multi-account'],
        enabled: enabled,
      );

  setUp(() {
    keychain = _Keychain();
    legacy = keychain.storage(_legacy);
    current = keychain.storage(_current);
  });

  test('re-writes existing items with the device-only class', () async {
    keychain.items['session'] = (value: 'tokens', accessibility: _legacy);
    keychain.items['multi-account'] = (
      value: 'accounts',
      accessibility: _legacy,
    );

    expect(await migrate(), isTrue);

    expect(await current.read(key: 'session'), 'tokens');
    expect(await current.read(key: 'multi-account'), 'accounts');
    expect(await legacy.read(key: 'session'), isNull);
    expect(keychain.items['session']!.accessibility, _current);
    expect(keychain.items[keychainMigrationMarkerKey]!.accessibility, _current);
  });

  test('signed-out installs only record the marker', () async {
    expect(await migrate(), isTrue);

    expect(keychain.items.keys, [keychainMigrationMarkerKey]);
  });

  test('runs once, so later legacy items are left alone', () async {
    await migrate();
    keychain.items['session'] = (value: 'late', accessibility: _legacy);

    expect(await migrate(), isFalse);

    expect(keychain.items['session']!.accessibility, _legacy);
  });

  test('restores the original item when staging the copy fails', () async {
    keychain.items['session'] = (value: 'tokens', accessibility: _legacy);
    keychain.failWrites = true;

    expect(await migrate(), isFalse);

    expect(await legacy.read(key: 'session'), 'tokens');
    expect(keychain.items.containsKey(keychainMigrationMarkerKey), isFalse);

    keychain.failWrites = false;
    expect(await migrate(), isTrue);
    expect(await current.read(key: 'session'), 'tokens');
  });

  test('restores the original item when the re-write fails', () async {
    keychain.items['session'] = (value: 'tokens', accessibility: _legacy);
    keychain.failWriteKeys.add('session');

    expect(await migrate(), isFalse);

    expect(await legacy.read(key: 'session'), 'tokens');
    expect(keychain.items.containsKey('session.migrating'), isFalse);
    expect(keychain.items.containsKey(keychainMigrationMarkerKey), isFalse);

    keychain.failWriteKeys.clear();
    expect(await migrate(), isTrue);
    expect(await current.read(key: 'session'), 'tokens');
  });

  test('a new-class write over an old item is a duplicate error', () async {
    keychain.items['session'] = (value: 'tokens', accessibility: _legacy);

    await expectLater(
      current.write(key: 'session', value: 'fresh'),
      throwsA(isA<PlatformException>()),
    );
    expect(await legacy.read(key: 'session'), 'tokens');
  });

  test(
    'recovers a session lost to a kill after the old item is deleted',
    () async {
      keychain.items['session'] = (value: 'tokens', accessibility: _legacy);
      keychain.items['multi-account'] = (
        value: 'accounts',
        accessibility: _legacy,
      );
      keychain.crashAfter = 'delete:session';

      expect(await migrate(), isFalse);

      expect(keychain.dead, isTrue);
      expect(keychain.items.containsKey('session'), isFalse);
      expect(keychain.items['session.migrating']!.value, 'tokens');

      keychain.restart();
      expect(await migrate(), isTrue);

      expect(await current.read(key: 'session'), 'tokens');
      expect(await current.read(key: 'multi-account'), 'accounts');
      expect(keychain.items.containsKey('session.migrating'), isFalse);
      expect(keychain.items.containsKey('multi-account.migrating'), isFalse);
      expect(
        keychain.items[keychainMigrationMarkerKey]!.accessibility,
        _current,
      );
    },
  );

  test(
    'recovers every account after a kill during the multi-account re-write',
    () async {
      keychain.items['multi-account'] = (
        value: 'accounts',
        accessibility: _legacy,
      );
      keychain.crashAfter = 'delete:multi-account';

      expect(await migrate(), isFalse);
      expect(keychain.items.containsKey('multi-account'), isFalse);

      keychain.restart();
      expect(await migrate(), isTrue);

      expect(await current.read(key: 'multi-account'), 'accounts');
    },
  );

  test(
    'recovers after a kill right after the staged copy is written',
    () async {
      keychain.items['session'] = (value: 'tokens', accessibility: _legacy);
      keychain.crashAfter = 'write:session.migrating';

      expect(await migrate(), isFalse);

      // Killed with both the old item and the staged copy in place.
      expect(keychain.dead, isTrue);
      expect(keychain.items['session']!.accessibility, _legacy);
      expect(keychain.items['session.migrating']!.value, 'tokens');

      keychain.restart();
      expect(await migrate(), isTrue);

      expect(await current.read(key: 'session'), 'tokens');
      expect(keychain.items['session']!.accessibility, _current);
      expect(keychain.items.containsKey('session.migrating'), isFalse);
    },
  );

  test('keeps a re-sign-in made during an unfinished migration', () async {
    keychain.items['session'] = (value: 'old-tokens', accessibility: _legacy);
    keychain.crashAfter = 'delete:session';
    await migrate();
    keychain.restart();

    // Signed in again before the migration got to run: the new session wins.
    await current.write(key: 'session', value: 'fresh-tokens');

    expect(await migrate(), isTrue);

    expect(await current.read(key: 'session'), 'fresh-tokens');
    expect(keychain.items.containsKey('session.migrating'), isFalse);
  });

  test('retries next launch when an old item is unreadable', () async {
    keychain.items['session'] = (value: 'tokens', accessibility: _legacy);
    keychain.items['multi-account'] = (
      value: 'accounts',
      accessibility: _legacy,
    );
    keychain.failReads.add('session');

    expect(await migrate(), isFalse);

    expect(await current.read(key: 'multi-account'), 'accounts');
    expect(keychain.items['session']!.accessibility, _legacy);
    expect(keychain.items.containsKey(keychainMigrationMarkerKey), isFalse);

    keychain.failReads.clear();
    expect(await migrate(), isTrue);
    expect(await current.read(key: 'session'), 'tokens');
  });

  test('does nothing when disabled (non-iOS platforms)', () async {
    keychain.items['session'] = (value: 'tokens', accessibility: _legacy);

    expect(await migrate(enabled: false), isFalse);

    expect(keychain.items['session']!.accessibility, _legacy);
    expect(keychain.items.containsKey(keychainMigrationMarkerKey), isFalse);
  });

  test('covers the session and multi-account refresh tokens', () {
    expect(authSecureStorageKeys, [
      supabasePersistSessionKey,
      'mobile-multi-account-store-v1',
    ]);
  });
  test('migration leaves newer retry staging ahead of legacy', () async {
    const key = supabasePersistSessionKey;
    keychain.items[key] = (value: 'old', accessibility: _legacy);
    keychain.items['$key.persist-retry'] = (
      value: 'fresh',
      accessibility: _current,
    );
    keychain.items[keychainMigrationStagingKey(key)] = (
      value: 'old-migration',
      accessibility: _current,
    );
    expect(
      await migrateAuthKeychainAccessibility(
        current: current,
        legacy: legacy,
        keys: [key],
        enabled: true,
      ),
      isTrue,
    );
    expect(await legacy.read(key: key), isNull);
    expect(await current.read(key: key), isNull);
    expect(
      await SupabaseSecureStorage(storage: current).accessToken(),
      'fresh',
    );
    expect(await current.read(key: key), 'fresh');
    expect(await current.read(key: '$key.persist-retry'), isNull);
  });

  test('persist replaces a legacy session after a locked start', () async {
    keychain.items[supabasePersistSessionKey] = (
      value: 'old',
      accessibility: _legacy,
    );
    keychain.failReads.add(supabasePersistSessionKey);
    await SupabaseSecureStorage(storage: current).persistSession('fresh');
    expect(await current.read(key: supabasePersistSessionKey), 'fresh');
    expect(keychain.items[supabasePersistSessionKey]!.accessibility, _current);
  });

  test(
    'persist replaces a downgraded item despite the migration marker',
    () async {
      await migrate();
      keychain.items[supabasePersistSessionKey] = (
        value: 'downgraded',
        accessibility: _legacy,
      );
      await SupabaseSecureStorage(storage: current).persistSession('fresh');
      expect(await current.read(key: supabasePersistSessionKey), 'fresh');
    },
  );

  test('persist propagates unrelated failures without deleting', () async {
    keychain.items[supabasePersistSessionKey] = (
      value: 'existing',
      accessibility: _current,
    );
    keychain.failWrites = true;
    await expectLater(
      SupabaseSecureStorage(storage: current).persistSession('fresh'),
      throwsA(isA<PlatformException>()),
    );
    expect(keychain.items[supabasePersistSessionKey]!.value, 'existing');
    verifyNever(() => current.delete(key: supabasePersistSessionKey));
  });

  test(
    'persist retries a duplicate only once and exposes retry failure',
    () async {
      when(
        () => current.write(key: supabasePersistSessionKey, value: 'fresh'),
      ).thenThrow(PlatformException(code: 'security', details: -25299));
      await expectLater(
        SupabaseSecureStorage(storage: current).persistSession('fresh'),
        throwsA(isA<PlatformException>()),
      );
      verify(
        () => current.write(key: supabasePersistSessionKey, value: 'fresh'),
      ).called(2);
      verify(() => current.delete(key: supabasePersistSessionKey)).called(1);
    },
  );

  DeviceSecureStorage deviceStorage({bool enabled = true}) =>
      DeviceSecureStorage(
        current: current,
        legacy: legacy,
        migrateIOS: enabled,
      );

  test(
    'device store reads legacy once and rewrites at the stronger class',
    () async {
      keychain.items['cache-key'] = (
        value: 'encrypted-key',
        accessibility: _legacy,
      );
      final storage = deviceStorage();
      expect(await storage.read(key: 'cache-key'), 'encrypted-key');
      expect(await storage.read(key: 'cache-key'), 'encrypted-key');
      expect(await legacy.read(key: 'cache-key'), isNull);
      verify(
        () => legacy.read(key: 'cache-key'),
      ).called(2); // migration + assertion
      expect(keychain.items['cache-key']!.accessibility, _current);
    },
  );

  for (final boundary in [
    'write:cache-key.device-class-migration-v1',
    'delete:cache-key',
    'write:cache-key',
  ]) {
    test('device store recovers interruption at $boundary', () async {
      keychain.items['cache-key'] = (value: 'key', accessibility: _legacy);
      keychain.crashAfter = boundary;
      await expectLater(
        deviceStorage().read(key: 'cache-key'),
        throwsA(isA<PlatformException>()),
      );
      keychain.restart();
      expect(await deviceStorage().read(key: 'cache-key'), 'key');
      expect(await legacy.read(key: 'cache-key'), isNull);
    });
  }

  test(
    'device store preserves locked items and retries after unlock',
    () async {
      keychain.items['cache-key'] = (value: 'key', accessibility: _legacy);
      keychain.failReads.add('cache-key');
      final storage = deviceStorage();
      await expectLater(
        storage.read(key: 'cache-key'),
        throwsA(isA<PlatformException>()),
      );
      expect(keychain.items['cache-key']!.value, 'key');
      keychain.failReads.clear();
      expect(await storage.read(key: 'cache-key'), 'key');
    },
  );

  test(
    'device store deletes staged recovery data on explicit removal',
    () async {
      keychain.items['cache-key.device-class-migration-v1'] = (
        value: 'stale',
        accessibility: _current,
      );
      final storage = deviceStorage();
      await storage.delete(key: 'cache-key');
      expect(await storage.read(key: 'cache-key'), isNull);
    },
  );

  test('device store serializes read then write then delete', () async {
    keychain.items['cache-key'] = (value: 'old', accessibility: _legacy);
    final storage = deviceStorage();
    final read = storage.read(key: 'cache-key');
    final write = storage.write(key: 'cache-key', value: 'new');
    final delete = storage.delete(key: 'cache-key');
    expect(await read, 'old');
    await write;
    await delete;
    expect(await storage.read(key: 'cache-key'), isNull);
  });

  test('device store does not consult legacy off iOS', () async {
    keychain.items['cache-key'] = (value: 'old', accessibility: _legacy);
    expect(await deviceStorage(enabled: false).read(key: 'cache-key'), isNull);
    verifyNever(() => legacy.read(key: 'cache-key'));
  });
}
