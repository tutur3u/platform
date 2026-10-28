import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/keychain_accessibility_migration.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

typedef _Item = ({String value, String accessibility});

/// Models the iOS keychain: an item is only visible to the accessibility class
/// it was written under, and deleting removes it for every class.
class _Keychain {
  final items = <String, _Item>{};
  final failReads = <String>{};
  bool failWrites = false;

  FlutterSecureStorage storage(String accessibility) {
    final storage = _MockFlutterSecureStorage();
    when(() => storage.read(key: any(named: 'key'))).thenAnswer((call) async {
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
      if (failWrites && accessibility == _current) {
        throw PlatformException(code: 'write-failed');
      }
      items[call.namedArguments[#key] as String] = (
        value: call.namedArguments[#value] as String,
        accessibility: accessibility,
      );
    });
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((call) async {
      items.remove(call.namedArguments[#key] as String);
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

  test('restores the original item when the re-write fails', () async {
    keychain.items['session'] = (value: 'tokens', accessibility: _legacy);
    keychain.failWrites = true;

    expect(await migrate(), isFalse);

    expect(await legacy.read(key: 'session'), 'tokens');
    expect(keychain.items.containsKey(keychainMigrationMarkerKey), isFalse);

    keychain.failWrites = false;
    expect(await migrate(), isTrue);
    expect(await current.read(key: 'session'), 'tokens');
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
