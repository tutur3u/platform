import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/pump_app.dart';
import 'secret_test_support.dart';

/// Secure storage whose next read waits for [hold], and next write for
/// [holdWrite], once set.
class _GateStorage extends FlutterSecureStorage {
  _GateStorage();

  Completer<void>? hold;
  Completer<void>? holdWrite;
  bool failWrite = false;

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
  }) async {
    final gate = holdWrite;
    if (gate != null) {
      holdWrite = null;
      await gate.future;
    }
    if (failWrite) throw Exception('keychain write failed');
    await super.write(key: key, value: value);
  }

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
    final gate = hold;
    if (gate != null) {
      hold = null;
      await gate.future;
    }
    return await super.read(key: key);
  }
}

/// Runs [onDispatch] when an answer reaches the source, before its guard.
class _HookedSource extends RecordingSecretSource {
  _HookedSource(this.onDispatch);

  final void Function() onDispatch;

  @override
  Future<void> answerSecret({
    required String decisionId,
    required FleetSecretAnswer answer,
    required String idempotencyKey,
    Future<bool> Function()? stillTrusted,
  }) async {
    onDispatch();
    await super.answerSecret(
      decisionId: decisionId,
      answer: answer,
      idempotencyKey: idempotencyKey,
      stillTrusted: stillTrusted,
    );
  }
}

/// Runs [afterDispatch] once the answer has been dispatched, before the
/// reply returns to the cubit.
class _AfterDispatchSource extends RecordingSecretSource {
  _AfterDispatchSource(this.afterDispatch);

  final void Function() afterDispatch;

  @override
  Future<void> answerSecret({
    required String decisionId,
    required FleetSecretAnswer answer,
    required String idempotencyKey,
    Future<bool> Function()? stillTrusted,
  }) async {
    await super.answerSecret(
      decisionId: decisionId,
      answer: answer,
      idempotencyKey: idempotencyKey,
      stillTrusted: stillTrusted,
    );
    afterDispatch();
  }
}

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#pairing
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FakeSecretPlatform platform;
  late _GateStorage storage;
  late FleetSecretPins pins;
  late RecordingSecretSource source;
  final now = DateTime.utc(2026, 11, 22, 10, 5);
  final signerKey =
      (secretFixture['request'] as Map<String, dynamic>)['signerKey'] as String;
  // A valid Ed25519 key other than the machine's: the fixture owner key.
  final oldKey = secretFixture['ownerKey'] as String;
  const firstId = 'pair-0123456789abcdef01234567';
  const repairId = 'pair-fedcba9876543210fedcba98';
  final value = Uint8List.fromList(utf8.encode('disposable'));

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
    platform = FakeSecretPlatform()..install();
    storage = _GateStorage();
    pins = FleetSecretPins(userId: () => 'user-1', storage: storage);
    source = RecordingSecretSource();
    FleetPairingAttempts.shared.clear();
  });
  tearDown(() => platform.uninstall());

  Future<void> pinActive({String? key, String id = firstId}) async {
    await pins.putPending(
      machineId: 'skr-m4',
      signerKey: key ?? signerKey,
      label: 'Skora M4',
      pairingId: id,
      now: now,
      expiresAt: now.add(const Duration(minutes: 10)),
    );
    await pins.activate(
      machineId: 'skr-m4',
      pairingId: id,
      signerKey: key ?? signerKey,
      clock: () => now,
    );
  }

  FleetSecretCubit cubit(
    FleetDecision decision, {
    RecordingSecretSource? answers,
    FleetPairingAttempts? attempts,
  }) => FleetSecretCubit(
    decision: decision,
    crypto: platform.crypto(),
    pins: pins,
    source: answers ?? source,
    accountId: () => 'user-1',
    now: () => now,
    retryDelay: (_) => Duration.zero,
    attempts: attempts ?? FleetPairingAttempts(),
  );

  test('a Forget tapped while the transport guard reads refuses', () async {
    await pinActive();
    final gate = Completer<void>();
    var held = false;
    // At dispatch, hold the transport guard's own pin read.
    final hooked = _HookedSource(() {
      storage.hold = gate;
      held = true;
    });
    final flow = cubit(await signedRequestDecision(), answers: hooked);
    addTearDown(flow.close);
    await flow.start();
    flow.stepUpVerified();
    final sending = flow.send(Uint8List.fromList(value));
    while (!held) {
      await pumpEventQueue();
    }
    await pumpEventQueue();
    // The Forget's write queues behind the held read; its epoch moves now.
    final forgetting = pins.forget('skr-m4');
    gate.complete();
    await sending;
    await forgetting;
    expect(hooked.answers, isEmpty);
    expect(flow.state.block, FleetSecretBlock.keyChanged);
  });

  test('a duplicate activation never stops a valid request', () async {
    await pinActive();
    final flow = cubit(await signedRequestDecision());
    addTearDown(flow.close);
    await flow.start();
    flow.stepUpVerified();
    // Another screen applies the same, already applied confirmation.
    expect(
      await pins.activate(
        machineId: 'skr-m4',
        pairingId: firstId,
        signerKey: signerKey,
        clock: () => now,
      ),
      isNull,
    );
    await flow.send(Uint8List.fromList(value));
    expect(source.answers, hasLength(1));
    expect(flow.state.phase, FleetSecretPhase.sent);
  });

  test('leaving the page refuses at the transport guard', () async {
    await pinActive();
    late FleetSecretCubit flow;
    final hooked = _HookedSource(() => flow.leave());
    flow = cubit(await signedRequestDecision(), answers: hooked);
    addTearDown(flow.close);
    await flow.start();
    flow.stepUpVerified();
    await flow.send(Uint8List.fromList(value));
    expect(hooked.answers, isEmpty);
    expect(flow.state.block, isNull);
  });

  test('a reply after leaving still marks the request handled', () async {
    await pinActive();
    late FleetSecretCubit flow;
    var handled = 0;
    final source = _AfterDispatchSource(() => flow.leave());
    flow = FleetSecretCubit(
      decision: await signedRequestDecision(),
      crypto: platform.crypto(),
      pins: pins,
      source: source,
      accountId: () => 'user-1',
      now: () => now,
      retryDelay: (_) => Duration.zero,
      attempts: FleetPairingAttempts(),
      onHandled: () => handled++,
    );
    addTearDown(flow.close);
    await flow.start();
    flow.stepUpVerified();
    await flow.send(Uint8List.fromList(value));
    expect(source.answers, hasLength(1));
    expect(handled, 1);
    expect(flow.state.phase, FleetSecretPhase.sent);
  });

  test('an activation queued behind the guard read refuses', () async {
    await pinActive();
    // A re-pairing already waits; the request still verifies the old key.
    await pins.putPending(
      machineId: 'skr-m4',
      signerKey: oldKey,
      label: 'Skora M4',
      pairingId: repairId,
      now: now,
      expiresAt: now.add(const Duration(minutes: 10)),
    );
    final gate = Completer<void>();
    var held = false;
    final hooked = _HookedSource(() {
      storage.hold = gate;
      held = true;
    });
    final flow = cubit(await signedRequestDecision(), answers: hooked);
    addTearDown(flow.close);
    await flow.start();
    flow.stepUpVerified();
    final sending = flow.send(Uint8List.fromList(value));
    while (!held) {
      await pumpEventQueue();
    }
    await pumpEventQueue();
    // The swap queues behind the held read and commits after it.
    final swapping = pins.activate(
      machineId: 'skr-m4',
      pairingId: repairId,
      signerKey: oldKey,
      clock: () => now,
    );
    gate.complete();
    await sending;
    expect((await swapping)?.signerKey, oldKey);
    expect(hooked.answers, isEmpty);
    expect(flow.state.block, FleetSecretBlock.keyChanged);
  });

  for (final (name, leave)
      in <(String, Future<void> Function(WidgetTester, FleetSecretRoute))>[
        (
          'the Close button',
          (tester, _) => tester.tap(find.byTooltip('Close')),
        ),
        ('system Back', (tester, _) => tester.binding.handlePopRoute()),
        (
          'removal under its parent',
          (tester, route) async => route.navigator!.removeRoute(route),
        ),
      ]) {
    testWidgets('$name during a held dispatch sends nothing', (tester) async {
      await tester.runAsync(pinActive);
      final decision = (await tester.runAsync(signedRequestDecision))!;
      final gate = Completer<void>();
      var held = false;
      // Hold the transport guard's own pin read at dispatch.
      final hooked = _HookedSource(() {
        storage.hold = gate;
        held = true;
      });
      final flow = cubit(decision, answers: hooked);
      await tester.runAsync(flow.start);
      flow.stepUpVerified();
      final route = FleetSecretRoute(
        builder: (_) => FleetSecretPage(
          decision: decision,
          create: () => flow,
          stepUp: null,
          now: () => now,
        ),
      );
      await tester.pumpApp(
        Builder(
          builder: (context) => TextButton(
            onPressed: () => Navigator.of(context).push(route),
            child: const Text('open'),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      late Future<void> sending;
      await tester.runAsync(() async {
        sending = flow.send(Uint8List.fromList(value));
        while (!held) {
          await Future<void>.delayed(const Duration(milliseconds: 1));
        }
      });
      await leave(tester, route);
      // Released before the frame that could dispose the page: only the
      // route completion fences this dispatch.
      gate.complete();
      await tester.runAsync(() => sending);
      expect(flow.isClosed, isFalse);
      expect(hooked.answers, isEmpty);
      await tester.pump(const Duration(seconds: 1));
    });
  }

  test('closing while the owner MAC runs never stages', () async {
    await pinActive(key: oldKey, id: repairId);
    late FleetSecretCubit flow;
    var macs = 0;
    platform.onCall = (method) async {
      // The second HMAC is the owner MAC, after the code check passed.
      if (method == 'hmac' && ++macs == 2) flow.leave();
    };
    flow = cubit(pairDecision());
    addTearDown(flow.close);
    await flow.start();
    flow.stepUpVerified();
    await flow.submitCode('008j 4ct4 ank7 f24s');
    expect(macs, 2);
    final pin = (await pins.read())['skr-m4']!;
    expect(pin.signerKey, oldKey);
    expect(pin.candidate, isNull);
    expect(source.answers, isEmpty);
  });

  test('leaving while staging waits keeps the earlier candidate', () async {
    await pinActive(key: oldKey, id: repairId);
    // An earlier re-pairing already waits for its machine's confirmation.
    const earlierKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    await pins.putPending(
      machineId: 'skr-m4',
      signerKey: earlierKey,
      label: 'Skora M4',
      pairingId: 'pair-111111111111111111111111',
      now: now,
      expiresAt: now.add(const Duration(minutes: 10)),
    );
    final revision = (await pins.trust('skr-m4')).revision;
    final gate = Completer<void>();
    var macs = 0;
    platform.onCall = (method) async {
      // After the owner MAC, hold the staging write's own pin read.
      if (method == 'hmac' && ++macs == 2) storage.hold = gate;
    };
    final flow = cubit(pairDecision());
    addTearDown(flow.close);
    await flow.start();
    flow.stepUpVerified();
    final submitted = flow.submitCode('008j 4ct4 ank7 f24s');
    while (macs < 2 || storage.hold != null) {
      await pumpEventQueue();
    }
    flow.leave();
    gate.complete();
    await submitted;
    final trust = await pins.trust('skr-m4');
    expect(trust.revision, revision);
    expect(trust.pin?.candidate?.signerKey, earlierKey);
    expect(source.answers, isEmpty);
  });

  test('a reply after close still clears the Inbox card once', () async {
    await pinActive();
    late FleetSecretCubit flow;
    var handled = 0;
    final source = _AfterDispatchSource(() => unawaited(flow.close()));
    flow = FleetSecretCubit(
      decision: await signedRequestDecision(),
      crypto: platform.crypto(),
      pins: pins,
      source: source,
      accountId: () => 'user-1',
      now: () => now,
      retryDelay: (_) => Duration.zero,
      attempts: FleetPairingAttempts(),
      onHandled: () => handled++,
    );
    await flow.start();
    flow.stepUpVerified();
    await flow.send(Uint8List.fromList(value));
    expect(source.answers, hasLength(1));
    expect(handled, 1);
  });

  test('a stage whose write fails leaves open requests valid', () async {
    await pinActive();
    final flow = cubit(await signedRequestDecision());
    addTearDown(flow.close);
    await flow.start();
    flow.stepUpVerified();
    storage.failWrite = true;
    await expectLater(
      pins.putPending(
        machineId: 'skr-m4',
        signerKey: oldKey,
        label: 'Skora M4',
        pairingId: repairId,
        now: now,
        expiresAt: now.add(const Duration(minutes: 10)),
      ),
      throwsA(isA<Exception>()),
    );
    storage.failWrite = false;
    await flow.send(Uint8List.fromList(value));
    expect(source.answers, hasLength(1));
    expect(flow.state.phase, FleetSecretPhase.sent);
  });

  test('an id-mismatched pairing card never offers Forget', () async {
    await pinActive(key: oldKey, id: repairId);
    final mismatched = FleetDecision.parse({
      ...decisionJson(pairDecision()),
      'id': 'pair-ffffffffffffffffffffffff',
    })!;
    final flow = cubit(mismatched);
    addTearDown(flow.close);
    await flow.start();
    expect(flow.state.block, FleetSecretBlock.idMismatch);
    expect(flow.state.forgettable, isFalse);
  });

  test('refreshing Forget keeps the transient state', () {
    const state = FleetSecretState(
      phase: FleetSecretPhase.stepUp,
      block: FleetSecretBlock.pendingPin,
      codeError: FleetSecretCodeError.wrong,
      retrying: true,
      resend: true,
    );
    final next = state.withForgettable(true);
    expect(next.forgettable, isTrue);
    expect(next.block, state.block);
    expect(next.codeError, state.codeError);
    expect(next.retrying, isTrue);
    expect(next.resend, isTrue);
  });

  test('a reset overtaking an in-flight count write leaves none', () async {
    final pairing = pairDecision().secret! as FleetSecretPairing;
    final counts = FleetPairingAttempts(storage: storage);
    final gate = storage.holdWrite = Completer<void>();
    final checking = FleetSecretPairer(
      crypto: platform.crypto(),
      attempts: counts,
    ).check(pairing, '0000-0000-0000-0000', now: now);
    // Wait until the wrong code's write has started and is held.
    while (storage.holdWrite != null) {
      await pumpEventQueue();
    }
    // The write is in flight; the reset starts now.
    counts.clear();
    final erasing = counts.eraseSaved();
    gate.complete();
    await checking;
    await erasing;
    expect(counts.wrong(pairing), 0);
    expect(await storage.read(key: FleetPairingAttempts.storageKey), isNull);
  });
}
