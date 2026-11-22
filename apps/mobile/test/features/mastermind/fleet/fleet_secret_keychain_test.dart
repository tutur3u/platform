import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_keychain.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'secret_test_support.dart';

final Matcher _refused = throwsA(
  isA<FleetSecretCryptoException>().having((e) => e.code, 'code', 'keychain'),
);

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#phone
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FakeSecretPlatform platform;
  late RecordingSecretSource source;
  const keychain = FleetSecretKeychain();
  final now = DateTime.utc(2026, 11, 22, 10, 5);
  final signerKey =
      (secretFixture['request'] as Map<String, dynamic>)['signerKey'] as String;
  const pairingId = 'pair-0123456789abcdef01234567';

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'elsewhere': 'other plugin'});
    SharedPreferences.setMockInitialValues(secretTestPrefs());
    platform = FakeSecretPlatform()..install();
    source = RecordingSecretSource();
  });
  tearDown(() => platform.uninstall());

  // The stores below take the app's storage by default.
  FleetSecretPins pins() => FleetSecretPins(userId: () => 'user-1');

  Future<void> pinActive(FleetSecretPins pins) async {
    await pins.putPending(
      machineId: 'skr-m4',
      signerKey: signerKey,
      label: 'Skora M4',
      pairingId: pairingId,
      now: now,
      expiresAt: now.add(const Duration(minutes: 10)),
    );
    await pins.activate(
      machineId: 'skr-m4',
      pairingId: pairingId,
      signerKey: signerKey,
      clock: () => now,
    );
  }

  FleetSecretCubit cubit(FleetDecision decision, FleetSecretPins pins) =>
      FleetSecretCubit(
        decision: decision,
        crypto: platform.crypto(),
        pins: pins,
        source: source,
        accountId: () => 'user-1',
        now: () => now,
        retryDelay: (_) => Duration.zero,
        attempts: FleetPairingAttempts(storage: fleetSecretStorage),
      );

  group('the adapter', () {
    test('is the storage every secret store defaults to', () {
      expect(fleetSecretStorage, isA<FleetSecretKeychain>());
      expect(FleetSecretKeychain.service, 'tuturuuu.mastermind-secret');
    });

    test('reads, writes, lists and deletes through the app plugin', () async {
      expect(await keychain.read(key: 'a'), isNull);
      await keychain.write(key: 'a', value: '1');
      await keychain.write(key: 'a', value: '2');
      await keychain.write(key: 'b', value: '3');
      expect(await keychain.read(key: 'a'), '2');
      expect(await keychain.containsKey(key: 'a'), isTrue);
      expect(await keychain.readAll(), {'a': '2', 'b': '3'});
      expect(await keychain.keys(), ['a', 'b']);
      await keychain.delete(key: 'b');
      await keychain.write(key: 'a', value: null);
      expect(await keychain.readAll(), isEmpty);
      // Nothing came from, or went to, the secure-storage plugin.
      expect(await keychain.read(key: 'elsewhere'), isNull);
      expect(await const FlutterSecureStorage().readAll(), {
        'elsewhere': 'other plugin',
      });
      expect(platform.calls.every((call) => call.startsWith('store')), isTrue);
    });

    test(
      'a refused write throws, keeps the old value and deletes nothing',
      () async {
        await keychain.write(key: 'pins', value: 'old');
        platform
          ..calls.clear()
          ..refuseStoreWrites = true;
        await expectLater(keychain.write(key: 'pins', value: 'new'), _refused);
        platform.refuseStoreWrites = false;
        expect(platform.calls, ['storeWrite']);
        expect(await keychain.read(key: 'pins'), 'old');
      },
    );

    test(
      'a refused read or listing throws and is never a missing item',
      () async {
        await keychain.write(key: 'pins', value: 'old');
        platform.refuseStoreReads = true;
        await expectLater(keychain.read(key: 'pins'), _refused);
        await expectLater(keychain.containsKey(key: 'pins'), _refused);
        await expectLater(keychain.readAll(), _refused);
        await expectLater(keychain.keys(), _refused);
      },
    );

    test('a listing with no answer or a malformed row is a failure', () async {
      const channel = MethodChannel('test/mastermind_secret_listing');
      const odd = FleetSecretKeychain(channel: channel);
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
      final failed = throwsA(
        isA<FleetSecretCryptoException>().having(
          (e) => e.code,
          'code',
          'failed',
        ),
      );
      Object? reply;
      messenger.setMockMethodCallHandler(channel, (call) async => reply);
      await expectLater(odd.readAll(), failed);
      await expectLater(odd.keys(), failed);
      reply = {'pins': 1};
      await expectLater(odd.readAll(), failed);
      reply = {1: 'pins'};
      await expectLater(odd.readAll(), failed);
      reply = ['pins', 2];
      await expectLater(odd.keys(), failed);
    });

    test('a refused delete throws and keeps the item', () async {
      await keychain.write(key: 'pins', value: 'old');
      platform.refuseStoreDeletes = true;
      await expectLater(keychain.delete(key: 'pins'), _refused);
      await expectLater(keychain.write(key: 'pins', value: null), _refused);
      platform.refuseStoreDeletes = false;
      expect(await keychain.read(key: 'pins'), 'old');
    });

    test('without the plugin every call is unsupported', () async {
      platform.uninstall();
      final unsupported = throwsA(
        isA<FleetSecretCryptoException>().having(
          (e) => e.code,
          'code',
          'unsupported',
        ),
      );
      await expectLater(keychain.read(key: 'pins'), unsupported);
      await expectLater(keychain.write(key: 'pins', value: 'x'), unsupported);
    });

    test('bulk delete is refused', () {
      expect(keychain.deleteAll, throwsUnsupportedError);
    });
  });

  group('on a Keychain that refuses', () {
    test('an erase lists names only and removes an unreadable pin', () async {
      final store = pins();
      await pinActive(store);
      platform
        ..store['${FleetSecretPins.keyPrefix}other-user'] = 'not json'
        ..store['unrelated'] = 'kept'
        ..calls.clear();
      await store.eraseAll();
      expect(platform.store, {'unrelated': 'kept'});
      expect(platform.calls, isNot(contains('storeReadAll')));
      expect(platform.calls, isNot(contains('storeRead')));
    });

    test('an erase whose listing is refused deletes nothing', () async {
      final store = pins();
      await pinActive(store);
      final saved = Map.of(platform.store);
      platform.refuseStoreReads = true;
      await expectLater(store.eraseAll(), _refused);
      expect(platform.store, saved);
    });

    test('a pin change stores nothing and announces nothing', () async {
      final store = pins();
      await pinActive(store);
      final saved = Map.of(platform.store);
      final changes = fleetSecretPinChanges.value;
      platform
        ..refuseStoreWrites = true
        ..refuseStoreDeletes = true;
      await expectLater(store.forget('skr-m4'), _refused);
      platform
        ..refuseStoreWrites = false
        ..refuseStoreDeletes = false;
      expect(platform.store, saved);
      expect(fleetSecretPinChanges.value, changes);
      expect((await store.read())['skr-m4']?.active, isTrue);
    });

    test('a pairing whose pin cannot be stored sends nothing', () async {
      final flow = cubit(pairDecision(), pins());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      platform.refuseStoreWrites = true;
      await flow.submitCode('008j 4ct4 ank7 f24s');
      expect(flow.state.phase, FleetSecretPhase.blocked);
      expect(flow.state.block, FleetSecretBlock.failed);
      expect(source.answers, isEmpty);
      expect(
        platform.store.keys.where(
          (k) => k.startsWith('mastermind-secret-pins'),
        ),
        isEmpty,
      );
    });

    test(
      'a value is neither sealed nor sent when trust cannot be read',
      () async {
        final store = pins();
        await pinActive(store);
        final flow = cubit(await signedRequestDecision(), store);
        addTearDown(flow.close);
        await flow.start();
        flow.stepUpVerified();
        platform.refuseStoreReads = true;
        await flow.send(Uint8List.fromList(utf8.encode('disposable')));
        expect(flow.state.phase, FleetSecretPhase.blocked);
        expect(platform.sealed, isEmpty);
        expect(source.answers, isEmpty);
      },
    );

    test('a request cannot open when its pin cannot be read', () async {
      final store = pins();
      await pinActive(store);
      platform.refuseStoreReads = true;
      final flow = cubit(await signedRequestDecision(), store);
      addTearDown(flow.close);
      await flow.start();
      expect(flow.state.phase, FleetSecretPhase.blocked);
      expect(flow.state.block, FleetSecretBlock.failed);
    });

    test('Forget that cannot be stored keeps the pin and says so', () async {
      final store = pins();
      await pinActive(store);
      final flow = cubit(await signedRequestDecision(), store);
      addTearDown(flow.close);
      await flow.start();
      platform
        ..refuseStoreWrites = true
        ..refuseStoreDeletes = true;
      await flow.forgetMachine();
      expect(flow.state.phase, FleetSecretPhase.blocked);
      expect(flow.state.block, FleetSecretBlock.failed);
      platform
        ..refuseStoreWrites = false
        ..refuseStoreDeletes = false;
      expect((await store.read())['skr-m4']?.active, isTrue);
    });

    test('saved wrong-code counts that cannot be read take no code', () async {
      final attempts = FleetPairingAttempts(storage: fleetSecretStorage);
      platform.refuseStoreReads = true;
      expect(await attempts.load(now: now), isFalse);
      platform.refuseStoreReads = false;
      expect(await attempts.load(now: now), isTrue);
    });
  });

  group('the owner-key erase', () {
    Matcher coded(String code) => throwsA(
      isA<FleetSecretCryptoException>().having((e) => e.code, 'code', code),
    );

    test('returns once the plugin has deleted the keys', () async {
      await platform.crypto().deleteOwnerKeys();
      expect(platform.deletedAccounts, [null]);
    });

    test('returns off iOS and below iOS 17, where no key can exist', () async {
      await FleetSecretCrypto(isIOS: () => false).deleteOwnerKeys();
      expect(platform.calls, isEmpty);
      platform.supported = false;
      await platform.crypto().deleteOwnerKeys();
      expect(platform.deletedAccounts, isEmpty);
    });

    test('throws on iOS when the plugin is missing', () async {
      platform.uninstall();
      await expectLater(
        platform.crypto().deleteOwnerKeys(),
        coded('unsupported'),
      );
    });

    test('throws when the Keychain refuses the delete', () async {
      platform.onCall = (method) async {
        if (method == 'deleteOwnerKeys') {
          throw PlatformException(code: 'keychain');
        }
      };
      await expectLater(platform.crypto().deleteOwnerKeys(), coded('keychain'));
      expect(platform.deletedAccounts, isEmpty);
    });
  });

  group('the native store', () {
    final swift = File(
      'ios/Runner/MastermindSecretStore.swift',
    ).readAsStringSync();

    test('keeps the service the adapter names', () {
      expect(
        swift,
        contains('static let service = "${FleetSecretKeychain.service}"'),
      );
      expect(swift, contains('kSecAttrAccessibleWhenUnlockedThisDeviceOnly'));
    });

    test('never deletes on its write path', () {
      final start = swift.indexOf('func write(');
      final end = swift.indexOf('\n  }\n', start);
      expect(start, greaterThan(0));
      expect(end, greaterThan(start));
      final body = swift.substring(start, end);
      expect(body, contains('keychain.update('));
      expect(body, contains('errSecItemNotFound'));
      expect(body.toLowerCase(), isNot(contains('delete')));
      // Deleting is one named call, used by `delete` alone.
      expect('keychain.delete('.allMatches(swift), hasLength(1));
    });

    test('lists names without asking for password data', () {
      final start = swift.indexOf('func keys(');
      final end = swift.indexOf('\n  }\n', start);
      expect(start, greaterThan(0));
      final body = swift.substring(start, end);
      expect(body, contains('kSecMatchLimitAll'));
      expect(body, isNot(contains('kSecReturnData')));
      // No other query asks for every item.
      expect('= kSecMatchLimitAll'.allMatches(swift), hasLength(1));
    });

    test('is the only Keychain path of the plugin for these items', () {
      final plugin = File(
        'ios/Runner/MastermindSecretPlugin.swift',
      ).readAsStringSync();
      expect(plugin, contains('MastermindSecretStore()'));
      expect(plugin.toLowerCase(), isNot(contains('flutter_secure_storage')));
    });
  });
}
