import 'dart:async';

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

  group('trust bound to the sign-in session', () {
    late FleetSecretPins pins;

    Future<void> pinActive() async {
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
    }

    setUp(() => pins = FleetSecretPins(userId: () => 'user-1'));

    test('a new sign-in erases the old trust before admitting', () async {
      expect(await settleFleetSecretErase(crypto: platform.crypto()), isTrue);
      await pinActive();
      // Same session: the trust stays.
      expect(await settleFleetSecretErase(crypto: platform.crypto()), isTrue);
      expect(await pins.read(), isNotEmpty);
      fleetSecretSessionId = () => 'session-next';
      expect(await settleFleetSecretErase(crypto: platform.crypto()), isTrue);
      expect(await pins.read(), isEmpty);
    });

    test(
      'a lost marker after a cold restart cannot restore old trust',
      () async {
        expect(await settleFleetSecretErase(crypto: platform.crypto()), isTrue);
        await pinActive();
        // Sign-out's erase is refused, and the restart loses every preference.
        platform.refuseStoreDeletes = true;
        await eraseFleetSecretKeys(crypto: platform.crypto(), pins: pins);
        SharedPreferences.setMockInitialValues({});
        fleetSecretSessionId = () => 'session-next';
        expect(
          await settleFleetSecretErase(crypto: platform.crypto()),
          isFalse,
        );
        expect(await pending(), isTrue);
        // Once the Keychain allows it, the old pin goes before any admission.
        platform.refuseStoreDeletes = false;
        expect(await settleFleetSecretErase(crypto: platform.crypto()), isTrue);
        expect(await pins.read(), isEmpty);
      },
    );

    test('a malformed record admits nothing', () async {
      SharedPreferences.setMockInitialValues({fleetSecretTrustSessionKey: 42});
      expect(await settleFleetSecretErase(crypto: platform.crypto()), isFalse);
    });

    test('no readable session admits nothing', () async {
      fleetSecretSessionId = () => null;
      expect(await settleFleetSecretErase(crypto: platform.crypto()), isFalse);
    });

    test('a page blocked by a failed erase never offers Forget', () async {
      expect(await settleFleetSecretErase(crypto: platform.crypto()), isTrue);
      await pinActive();
      platform.refuseStoreDeletes = true;
      fleetSecretSessionId = () => 'session-next';
      final flow = FleetSecretCubit(
        decision: pairDecision(),
        crypto: platform.crypto(),
        pins: pins,
        source: RecordingSecretSource(),
        accountId: () => 'user-1',
        now: () => now,
        attempts: FleetPairingAttempts(),
      );
      addTearDown(flow.close);
      await flow.start();
      expect(flow.state.block, FleetSecretBlock.failed);
      expect(flow.state.forgettable, isFalse);
      platform.refuseStoreDeletes = false;
      await flow.forgetMachine();
      expect(await pins.read(), isNotEmpty);
    });

    test('closing while the erase settles ends quietly', () async {
      final gate = Completer<void>();
      platform.onCall = (method) async {
        if (method == 'deleteOwnerKeys') await gate.future;
      };
      final flow = FleetSecretCubit(
        decision: await signedRequestDecision(),
        crypto: platform.crypto(),
        pins: pins,
        source: RecordingSecretSource(),
        accountId: () => 'user-1',
        now: () => now,
        attempts: FleetPairingAttempts(),
      );
      final starting = flow.start();
      await pumpEventQueue();
      await flow.close();
      gate.complete();
      await starting;
      expect(flow.isClosed, isTrue);
    });
  });
}
