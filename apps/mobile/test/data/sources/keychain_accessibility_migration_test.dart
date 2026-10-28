import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/keychain_accessibility_migration.dart';
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
}
