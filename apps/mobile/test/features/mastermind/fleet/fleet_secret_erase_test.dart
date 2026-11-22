import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'secret_test_support.dart';

/// Plain secure storage that refuses to delete [refusedKey].
class _OneRefusal extends FlutterSecureStorage {
  const _OneRefusal(this.refusedKey);

  final String refusedKey;

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (key == refusedKey) throw Exception('keychain refused');
    await super.delete(key: key);
  }
}

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#roles
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const firstPin = '${FleetSecretPins.keyPrefix}0000';
  const secondPin = '${FleetSecretPins.keyPrefix}1111';
  final now = DateTime.utc(2026, 11, 22, 10, 5);
  final signerKey =
      (secretFixture['request'] as Map<String, dynamic>)['signerKey'] as String;

  late FakeSecretPlatform platform;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    FleetPairingAttempts.shared.clear();
    platform = FakeSecretPlatform()..install();
  });
  tearDown(() => platform.uninstall());

  Future<bool?> pending() async => (await SharedPreferences.getInstance())
      .getBool(fleetSecretErasePendingKey);

  test(
    'a refused deletion stays pending and blocks until it completes',
    () async {
      platform.store.addAll({firstPin: '{}', secondPin: '{}'});
      platform.refuseStoreDeletes = true;
      await eraseFleetSecretKeys(crypto: platform.crypto());
      expect(await pending(), isTrue);
      expect(await settleFleetSecretErase(crypto: platform.crypto()), isFalse);
      expect(platform.store.keys, containsAll([firstPin, secondPin]));

      platform.refuseStoreDeletes = false;
      expect(await settleFleetSecretErase(crypto: platform.crypto()), isTrue);
      expect(await pending(), isNull);
      expect(platform.store.keys, isNot(contains(firstPin)));
      expect(platform.store.keys, isNot(contains(secondPin)));
    },
  );

  test('a completed erase leaves nothing pending', () async {
    platform.store.addAll({firstPin: '{}'});
    await eraseFleetSecretKeys(crypto: platform.crypto());
    expect(await pending(), isNull);
    expect(await settleFleetSecretErase(crypto: platform.crypto()), isTrue);
  });

  test('a refused owner-key deletion blocks the next secret page', () async {
    final pins = FleetSecretPins(userId: () => 'user-1');
    await pins.putPending(
      machineId: 'skr-m4',
      signerKey: signerKey,
      label: 'Skora M4',
      pairingId: 'pair-0123456789abcdef01234567',
      now: now,
      expiresAt: now.add(const Duration(minutes: 10)),
    );
    await pins.activate(
      machineId: 'skr-m4',
      pairingId: 'pair-0123456789abcdef01234567',
      signerKey: signerKey,
      clock: () => now,
    );
    platform.onCall = (method) async {
      if (method == 'deleteOwnerKeys') {
        throw PlatformException(code: 'keychain');
      }
    };
    await eraseFleetSecretKeys(crypto: platform.crypto(), pins: pins);
    expect(await pending(), isTrue);

    final decision = await signedRequestDecision();
    FleetSecretCubit flow() => FleetSecretCubit(
      decision: decision,
      crypto: platform.crypto(),
      pins: pins,
      source: RecordingSecretSource(),
      accountId: () => 'user-1',
      now: () => now,
      attempts: FleetPairingAttempts(),
    );
    final blocked = flow();
    addTearDown(blocked.close);
    await blocked.start();
    expect(blocked.state.block, FleetSecretBlock.failed);

    // Once the Keychain allows it, the next page finishes the erase first:
    // the old pin is gone, so the machine must pair again.
    platform.onCall = null;
    final next = flow();
    addTearDown(next.close);
    await next.start();
    expect(await pending(), isNull);
    expect(next.state.phase, FleetSecretPhase.needsPairing);
  });

  test('an erase tries every pin even after a refusal', () async {
    FlutterSecureStorage.setMockInitialValues({
      firstPin: '{}',
      secondPin: '{}',
    });
    const storage = _OneRefusal(firstPin);
    final pins = FleetSecretPins(userId: () => null, storage: storage);
    await expectLater(pins.eraseAll(), throwsA(isA<Exception>()));
    final left = await const FlutterSecureStorage().readAll();
    expect(left.keys, [firstPin]);
  });
}
