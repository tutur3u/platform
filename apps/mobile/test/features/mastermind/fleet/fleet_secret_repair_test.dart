import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'secret_test_support.dart';

/// Secure storage whose reads or writes of one key fail.
class _FailingStorage extends FlutterSecureStorage {
  const _FailingStorage({this.failReads = false, this.failWrites = false});

  final bool failReads;
  final bool failWrites;

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) {
    if (failReads) throw Exception('keychain unavailable');
    return super.read(key: key);
  }

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) {
    if (failWrites) throw Exception('keychain unavailable');
    return super.write(key: key, value: value);
  }
}

/// Secure storage whose reads wait for [release].
class _SlowStorage extends FlutterSecureStorage {
  const _SlowStorage(this.release);

  final Completer<void> release;

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    await release.future;
    return await super.read(key: key);
  }
}

/// Runs [onAnswer] when the first answer arrives. With [retryFirst] that
/// answer is recorded as dispatched and the relay reports it unavailable,
/// so it is retried; otherwise [onAnswer] runs between the cubit's pin check
/// and the transport's dispatch guard.
class _HookedSource extends RecordingSecretSource {
  _HookedSource(this.onAnswer, {this.retryFirst = true});

  final Future<void> Function() onAnswer;
  final bool retryFirst;

  @override
  Future<void> answerSecret({
    required String decisionId,
    required FleetSecretAnswer answer,
    required String idempotencyKey,
    Future<bool> Function()? stillTrusted,
  }) async {
    if (keys.isEmpty) {
      keys.add(idempotencyKey);
      await onAnswer();
      if (!retryFirst) {
        await super.answerSecret(
          decisionId: decisionId,
          answer: answer,
          idempotencyKey: idempotencyKey,
          stillTrusted: stillTrusted,
        );
        return;
      }
      answers.add(answer.toJson());
      throw const FleetSecretSendException(FleetSecretSendFailure.unavailable);
    }
    await super.answerSecret(
      decisionId: decisionId,
      answer: answer,
      idempotencyKey: idempotencyKey,
      stillTrusted: stillTrusted,
    );
  }
}

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#pairing
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FakeSecretPlatform platform;
  late FleetSecretPins pins;
  late RecordingSecretSource source;
  late FleetPairingAttempts attempts;
  final now = DateTime.utc(2026, 11, 22, 10, 5);
  // The cubit's clock; tests move it to cross an expiry.
  var current = now;
  final signerKey =
      (secretFixture['request'] as Map<String, dynamic>)['signerKey'] as String;
  const oldKey = 'oJql9HpnWYAv-VX43C0qFKXJnSO-l_hkEn_5ODRVpPA';
  const firstId = 'pair-0123456789abcdef01234567';
  const repairId = 'pair-fedcba9876543210fedcba98';
  const goodCode = '008j 4ct4 ank7 f24s';
  const wrongCode = '0000-0000-0000-0000';

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
    platform = FakeSecretPlatform()..install();
    pins = FleetSecretPins(
      userId: () => 'user-1',
      storage: const FlutterSecureStorage(),
    );
    source = RecordingSecretSource();
    attempts = FleetPairingAttempts();
    current = now;
  });
  tearDown(() => platform.uninstall());

  Future<int?> stage({
    required String key,
    required String id,
    String label = 'Skora M4',
  }) => pins.putPending(
    machineId: 'skr-m4',
    signerKey: key,
    label: label,
    pairingId: id,
    now: now,
    expiresAt: now.add(const Duration(minutes: 10)),
  );

  Future<FleetSecretPin?> confirm({
    required String key,
    required String id,
    DateTime? at,
  }) => pins.activate(
    machineId: 'skr-m4',
    pairingId: id,
    signerKey: key,
    clock: () => at ?? now,
  );

  Future<void> pinActive({String? key, String id = firstId}) async {
    await stage(key: key ?? signerKey, id: id);
    await confirm(key: key ?? signerKey, id: id);
  }

  FleetSecretCubit cubit(
    FleetDecision decision, {
    Stream<FleetSnapshot?>? snapshots,
    RecordingSecretSource? answers,
  }) => FleetSecretCubit(
    decision: decision,
    crypto: platform.crypto(),
    pins: pins,
    source: answers ?? source,
    accountId: () => 'user-1',
    snapshots: snapshots,
    now: () => current,
    retryDelay: (_) => Duration.zero,
    attempts: attempts,
  );

  group('re-pairing a machine with an active pin', () {
    test('keeps the active key until the machine confirms', () async {
      await pinActive(key: oldKey);
      expect(await stage(key: signerKey, id: repairId), isNotNull);
      final pin = (await pins.read())['skr-m4']!;
      expect(pin.active, isTrue);
      expect(pin.signerKey, oldKey);
      expect(pin.candidate?.signerKey, signerKey);
      // A request signed by the unconfirmed key waits; it is not trusted.
      final flow = cubit(await signedRequestDecision());
      addTearDown(flow.close);
      await flow.start();
      expect(flow.state.block, FleetSecretBlock.pendingPin);
    });

    test('the machine-signed outcome swaps in the new key', () async {
      // The fixture card is pairing firstId, so the old pin used another.
      await pinActive(key: oldKey, id: repairId);
      final decision = pairDecision();
      final snapshots = StreamController<FleetSnapshot?>();
      addTearDown(snapshots.close);
      final flow = cubit(decision, snapshots: snapshots.stream);
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.submitCode(goodCode);
      expect(flow.state.phase, FleetSecretPhase.sent);
      expect((await pins.read())['skr-m4']!.signerKey, oldKey);
      snapshots.add(
        secretSnapshot(
          resolved: [
            await signedResolved(
              decision.id,
              'paired',
              secretFixture['ownerKeyId'] as String,
            ),
          ],
        ),
      );
      await pumpEventQueue();
      expect(flow.state.settled?.mine, isTrue);
      final pin = (await pins.read())['skr-m4']!;
      expect(pin.active, isTrue);
      expect(pin.signerKey, signerKey);
      expect(pin.candidate, isNull);
    });

    test(
      'a confirmation naming another key or pairing changes nothing',
      () async {
        await pinActive(key: oldKey);
        await stage(key: signerKey, id: repairId);
        expect(await confirm(key: oldKey, id: repairId), isNull);
        expect(await confirm(key: signerKey, id: firstId), isNull);
        expect((await pins.read())['skr-m4']!.signerKey, oldKey);
      },
    );

    test('expiry is checked inside the queued write', () async {
      await pinActive(key: oldKey);
      await stage(key: signerKey, id: repairId);
      // The clock moves past expiry after the confirmation was queued.
      var clock = now;
      final queued = pins.activate(
        machineId: 'skr-m4',
        pairingId: repairId,
        signerKey: signerKey,
        clock: () => clock,
      );
      clock = now.add(const Duration(minutes: 10));
      expect(await queued, isNull);
      final pin = (await pins.read())['skr-m4']!;
      expect(pin.signerKey, oldKey);
      expect(pin.awaiting(clock), isNull);
    });

    test('a pending pin with no stored expiry never activates', () async {
      final name =
          '${FleetSecretPins.keyPrefix}'
          '${sha256.convert(utf8.encode('user-1'))}';
      await const FlutterSecureStorage().write(
        key: name,
        value: jsonEncode({
          'skr-m4': {
            'signerKey': signerKey,
            'label': 'Skora M4',
            'pairedAt': now.toIso8601String(),
            'state': 'pending',
            'pairingId': firstId,
          },
        }),
      );
      expect((await pins.read())['skr-m4']?.active, isFalse);
      expect(await confirm(key: signerKey, id: firstId), isNull);
    });

    test('a pairing that activated is never staged again', () async {
      await pinActive();
      expect(await stage(key: oldKey, id: repairId), isNotNull);
      await confirm(key: oldKey, id: repairId);
      // Replaying the first pairing cannot bring its key back, even after
      // "Forget this machine".
      expect(await stage(key: signerKey, id: firstId), isNull);
      await pins.forget('skr-m4');
      expect(await stage(key: signerKey, id: firstId), isNull);
      expect(await pins.read(), isEmpty);
    });

    test('a Forget during the code check refuses the staging', () async {
      await pinActive(key: oldKey, id: repairId);
      platform.onCall = (method) async {
        if (method == 'hmac') await pins.forget('skr-m4');
      };
      final flow = cubit(pairDecision());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.submitCode(goodCode);
      expect(flow.state.block, FleetSecretBlock.failed);
      expect(source.answers, isEmpty);
      expect(await pins.read(), isEmpty);
    });

    test('a Forget and re-stage during the check still refuses', () async {
      // The stored pin ends where it began (none), but its revision moved.
      platform.onCall = (method) async {
        if (method != 'hmac') return;
        await stage(key: oldKey, id: repairId);
        await pins.forget('skr-m4');
      };
      final flow = cubit(pairDecision());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.submitCode(goodCode);
      expect(flow.state.block, FleetSecretBlock.failed);
      expect(source.answers, isEmpty);
    });

    test('a Forget after staging stops the pair answer at dispatch', () async {
      final hooked = _HookedSource(
        () => pins.forget('skr-m4'),
        retryFirst: false,
      );
      final flow = cubit(pairDecision(), answers: hooked);
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.submitCode(goodCode);
      expect(hooked.answers, isEmpty);
      expect(flow.state.block, FleetSecretBlock.failed);
    });

    test(
      'a reset while the code waits on the pin read counts nothing',
      () async {
        final flow = cubit(pairDecision());
        addTearDown(flow.close);
        await flow.start();
        flow.stepUpVerified();
        final submitted = flow.submitCode(wrongCode);
        // The erase bumps the generation synchronously, before the read ends.
        final erased = eraseFleetSecretKeys(
          crypto: platform.crypto(),
          pins: FleetSecretPins(
            userId: () => null,
            storage: const FlutterSecureStorage(),
          ),
        );
        await submitted;
        await erased;
        expect(attempts.wrong(pairDecision().secret! as FleetSecretPairing), 0);
        expect(source.answers, isEmpty);
      },
    );

    test(
      'the pairing page offers Forget for a stored pin and stays open',
      () async {
        await pinActive(key: oldKey, id: repairId);
        final flow = cubit(pairDecision());
        addTearDown(flow.close);
        await flow.start();
        expect(flow.state.forgettable, isTrue);
        await flow.forgetMachine();
        expect(flow.state.forgettable, isFalse);
        expect(flow.state.phase, isNot(FleetSecretPhase.closed));
        expect(await pins.read(), isEmpty);
      },
    );

    test('a confirmation after expiry never shows as paired', () async {
      final decision = pairDecision();
      final snapshots = StreamController<FleetSnapshot?>();
      addTearDown(snapshots.close);
      final flow = cubit(decision, snapshots: snapshots.stream);
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.submitCode(goodCode);
      current = (decision.secret! as FleetSecretPairing).expiresAtTime;
      snapshots.add(
        secretSnapshot(
          resolved: [
            await signedResolved(
              decision.id,
              'paired',
              secretFixture['ownerKeyId'] as String,
            ),
          ],
        ),
      );
      await pumpEventQueue();
      expect(flow.state.settled?.verified, isTrue);
      expect(flow.state.settled?.mine, isFalse);
      expect((await pins.read())['skr-m4']?.active, isFalse);
    });

    test('a replayed pairing card stops before sending', () async {
      await pinActive();
      final flow = cubit(pairDecision());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.submitCode(goodCode);
      expect(flow.state.block, FleetSecretBlock.failed);
      expect(source.answers, isEmpty);
    });
  });

  group('an open request', () {
    test('does not send after the machine is forgotten', () async {
      await pinActive();
      final flow = cubit(await signedRequestDecision());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await pins.forget('skr-m4');
      await flow.send(Uint8List.fromList(utf8.encode('disposable')));
      expect(flow.state.block, FleetSecretBlock.keyChanged);
      expect(source.answers, isEmpty);
    });

    test('the transport guard stops a Forget that races the send', () async {
      await pinActive();
      final hooked = _HookedSource(
        () => pins.forget('skr-m4'),
        retryFirst: false,
      );
      final flow = cubit(await signedRequestDecision(), answers: hooked);
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.send(Uint8List.fromList(utf8.encode('disposable')));
      expect(hooked.answers, isEmpty);
      expect(flow.state.block, FleetSecretBlock.keyChanged);
    });

    test('closing the screen before dispatch sends nothing', () async {
      await pinActive();
      late FleetSecretCubit flow;
      final hooked = _HookedSource(() => flow.close(), retryFirst: false);
      flow = cubit(await signedRequestDecision(), answers: hooked);
      await flow.start();
      flow.stepUpVerified();
      await flow.send(Uint8List.fromList(utf8.encode('disposable')));
      expect(hooked.answers, isEmpty);
    });

    test('a re-pairing staged elsewhere stops an open request', () async {
      await pinActive();
      final flow = cubit(await signedRequestDecision());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      expect(flow.state.forgettable, isFalse);
      await stage(key: oldKey, id: repairId);
      await pumpEventQueue();
      expect(flow.state.forgettable, isTrue);
      await flow.send(Uint8List.fromList(utf8.encode('disposable')));
      expect(flow.state.block, FleetSecretBlock.keyChanged);
      expect(source.answers, isEmpty);
    });

    test('stops retrying once its signer is no longer the pin', () async {
      await pinActive();
      final hooked = _HookedSource(() async {
        await stage(key: oldKey, id: repairId);
        await confirm(key: oldKey, id: repairId);
      });
      final flow = cubit(await signedRequestDecision(), answers: hooked);
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.send(Uint8List.fromList(utf8.encode('disposable')));
      await pumpEventQueue();
      expect(hooked.answers, hasLength(1));
      expect(flow.state.block, FleetSecretBlock.keyChanged);
    });
  });

  group('wrong pairing codes', () {
    final pairing = pairDecision().secret! as FleetSecretPairing;

    Future<FleetPairingCheck> wrong(
      FleetPairingAttempts counts, {
      FleetSecretPairing? card,
    }) async => (await FleetSecretPairer(
      crypto: platform.crypto(),
      attempts: counts,
    ).check(card ?? pairing, wrongCode, now: now)).$1;

    Future<FleetPairingAttempts> recordFive() async {
      final counts = FleetPairingAttempts(storage: fleetSecretStorage);
      for (var i = 0; i < FleetPairingAttempts.maxWrong; i++) {
        await wrong(counts);
      }
      expect(counts.locked(pairing), isTrue);
      return counts;
    }

    test('stay locked after the app restarts', () async {
      await recordFive();
      final restarted = FleetPairingAttempts(storage: fleetSecretStorage);
      expect(await restarted.load(now: now), isTrue);
      expect(restarted.locked(pairing), isTrue);
      expect(await wrong(restarted), FleetPairingCheck.locked);
    });

    test('are dropped once the pairing expires', () async {
      await recordFive();
      final later = FleetPairingAttempts(storage: fleetSecretStorage);
      await later.load(now: pairing.expiresAtTime);
      expect(later.wrong(pairing), 0);
    });

    test('are forgotten by an erase', () async {
      final counts = await recordFive();
      await eraseFleetSecretKeys(
        crypto: platform.crypto(),
        pins: FleetSecretPins(userId: () => null, storage: fleetSecretStorage),
      );
      counts.clear();
      expect(counts.locked(pairing), isFalse);
      expect(
        await fleetSecretStorage.read(key: FleetPairingAttempts.storageKey),
        isNull,
      );
      final restarted = FleetPairingAttempts(storage: fleetSecretStorage);
      await restarted.load(now: now);
      expect(restarted.wrong(pairing), 0);
    });

    test('a substituted card cannot change the genuine count', () async {
      final counts = await recordFive();
      // Same pairing id, shorter unauthenticated expiry.
      final substitute =
          pairDecision({
                'expiresAt': now
                    .add(const Duration(seconds: 30))
                    .toIso8601String(),
              }).secret!
              as FleetSecretPairing;
      expect(substitute.pairingId, pairing.pairingId);
      expect(await wrong(counts, card: substitute), FleetPairingCheck.wrong);
      expect(counts.wrong(substitute), 1);
      expect(counts.wrong(pairing), FleetPairingAttempts.maxWrong);
      final restarted = FleetPairingAttempts(storage: fleetSecretStorage);
      await restarted.load(now: now.add(const Duration(minutes: 1)));
      expect(restarted.locked(pairing), isTrue);
    });

    test('an erase during a check records nothing', () async {
      final counts = FleetPairingAttempts(storage: fleetSecretStorage);
      platform.onCall = (method) async {
        if (method == 'hmac') counts.clear();
      };
      expect(await wrong(counts), FleetPairingCheck.wrong);
      expect(counts.wrong(pairing), 0);
      expect(
        await fleetSecretStorage.read(key: FleetPairingAttempts.storageKey),
        isNull,
      );
    });

    test('a check queued before an erase records nothing', () async {
      final counts = FleetPairingAttempts(storage: fleetSecretStorage);
      final pairer = FleetSecretPairer(
        crypto: platform.crypto(),
        attempts: counts,
      );
      final first = pairer.check(pairing, wrongCode, now: now);
      final queued = pairer.check(pairing, wrongCode, now: now);
      counts.clear();
      expect((await first).$1, FleetPairingCheck.unavailable);
      expect((await queued).$1, FleetPairingCheck.unavailable);
      expect(counts.wrong(pairing), 0);
      expect(
        await fleetSecretStorage.read(key: FleetPairingAttempts.storageKey),
        isNull,
      );
    });

    test('a read overtaken by an erase never restores the counts', () async {
      await recordFive();
      final release = Completer<void>();
      final counts = FleetPairingAttempts(storage: _SlowStorage(release));
      final load = counts.load(now: now);
      await pumpEventQueue();
      counts.clear();
      release.complete();
      expect(await load, isFalse);
      expect(counts.wrong(pairing), 0);
    });

    test('concurrent checks never pass the fifth wrong code', () async {
      final counts = FleetPairingAttempts(storage: fleetSecretStorage);
      final results = await Future.wait([
        for (var i = 0; i < FleetPairingAttempts.maxWrong + 2; i++)
          wrong(counts),
      ]);
      expect(counts.wrong(pairing), FleetPairingAttempts.maxWrong);
      expect(results.where((r) => r == FleetPairingCheck.locked), hasLength(3));
    });

    test('an unreadable count takes no code', () async {
      final counts = FleetPairingAttempts(
        storage: const _FailingStorage(failReads: true),
      );
      expect(await counts.load(now: now), isFalse);
      expect(await wrong(counts), FleetPairingCheck.unavailable);
      attempts = counts;
      final flow = cubit(pairDecision());
      addTearDown(flow.close);
      await flow.start();
      expect(flow.state.block, FleetSecretBlock.failed);
    });

    test('an unsaved count takes no further code', () async {
      final counts = FleetPairingAttempts(
        storage: const _FailingStorage(failWrites: true),
      );
      expect(await wrong(counts), FleetPairingCheck.unavailable);
    });
  });
}
