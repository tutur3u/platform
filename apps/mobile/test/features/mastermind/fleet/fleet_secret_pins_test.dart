import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';

import 'package:shared_preferences/shared_preferences.dart';

import 'secret_test_support.dart';

/// Counts the listings an erase makes.
class _ListingStorage extends FlutterSecureStorage {
  const _ListingStorage(this.listings);

  final List<String> listings;

  @override
  Future<Map<String, String>> readAll({
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) {
    listings.add('readAll');
    return super.readAll();
  }
}

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#phone
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const pinKey = '${FleetSecretPins.keyPrefix}0000';
  const otherKey = 'another-feature.token';

  late FakeSecretPlatform platform;
  setUp(() => SharedPreferences.setMockInitialValues(secretTestPrefs()));
  tearDown(() => platform.uninstall());

  test('an erase removes every pin entry and nothing else', () async {
    FlutterSecureStorage.setMockInitialValues({
      pinKey: '{}',
      '${FleetSecretPins.keyPrefix}1111': '{}',
      otherKey: 'kept',
    });
    platform = FakeSecretPlatform()..install();
    final listings = <String>[];
    final storage = _ListingStorage(listings);
    await eraseFleetSecretKeys(
      crypto: platform.crypto(),
      pins: FleetSecretPins(userId: () => null, storage: storage),
    );
    expect(listings, ['readAll']);
    expect(await storage.readAll(), {otherKey: 'kept'});
    expect(platform.deletedAccounts, [null]);
  });

  test(
    'off the secret-entry platform an erase lists and asks nothing',
    () async {
      FlutterSecureStorage.setMockInitialValues({otherKey: 'kept'});
      platform = FakeSecretPlatform()..install();
      final listings = <String>[];
      final before = fleetSecretErasures.value;
      await eraseFleetSecretKeys(
        crypto: FleetSecretCrypto(isIOS: () => false),
        pins: FleetSecretPins(
          userId: () => null,
          storage: _ListingStorage(listings),
        ),
      );
      expect(listings, isEmpty);
      expect(platform.calls, isEmpty);
      expect(fleetSecretErasures.value, before + 1);
    },
  );

  test('a failed capability check keeps neither pins nor owner keys', () async {
    FlutterSecureStorage.setMockInitialValues({pinKey: '{}', otherKey: 'kept'});
    platform = FakeSecretPlatform()
      ..install()
      ..onCall = (method) async {
        if (method == 'supported') throw PlatformException(code: 'transient');
      };
    final crypto = platform.crypto();
    expect(await crypto.supported(), isFalse);
    const storage = FlutterSecureStorage();
    await eraseFleetSecretKeys(
      crypto: crypto,
      pins: FleetSecretPins(userId: () => null, storage: storage),
    );
    expect(await storage.readAll(), {otherKey: 'kept'});
    expect(platform.deletedAccounts, [null]);
    // The failed ask was not kept: a healthy plugin is believed afterwards.
    platform.onCall = null;
    expect(await crypto.supported(), isTrue);
  });

  test('below iOS 17 the owner-key erase ends quietly', () async {
    FlutterSecureStorage.setMockInitialValues({pinKey: '{}'});
    platform = FakeSecretPlatform(supported: false)..install();
    const storage = FlutterSecureStorage();
    await platform.crypto().deleteOwnerKeys();
    await eraseFleetSecretKeys(
      crypto: platform.crypto(),
      pins: FleetSecretPins(userId: () => null, storage: storage),
    );
    expect(await storage.readAll(), isEmpty);
    expect(platform.deletedAccounts, isEmpty);
  });
}
