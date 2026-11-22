import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'secret_test_support.dart';

/// Secure storage whose next read waits for [hold] once it is set.
class _GateStorage extends FlutterSecureStorage {
  _GateStorage();

  Completer<void>? hold;

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
  const oldKey = 'oJql9HpnWYAv-VX43C0qFKXJnSO-l_hkEn_5ODRVpPA';
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

  test('a Forget tapped while the guard read waits refuses', () async {
    await pinActive();
    final flow = cubit(await signedRequestDecision());
    addTearDown(flow.close);
    await flow.start();
    flow.stepUpVerified();
    final gate = storage.hold = Completer<void>();
    final sending = flow.send(Uint8List.fromList(value));
    await pumpEventQueue();
    // The Forget's write queues behind the waiting read; its epoch moves now.
    final forgetting = pins.forget('skr-m4');
    gate.complete();
    await sending;
    await forgetting;
    expect(source.answers, isEmpty);
    expect(flow.state.block, FleetSecretBlock.keyChanged);
  });

  test('a close that has only begun refuses the dispatch', () async {
    await pinActive();
    late FleetSecretCubit flow;
    final hooked = _HookedSource(() => unawaited(flow.close()));
    flow = cubit(await signedRequestDecision(), answers: hooked);
    await flow.start();
    flow.stepUpVerified();
    await flow.send(Uint8List.fromList(value));
    expect(hooked.answers, isEmpty);
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

  test('a reset during a code check leaves the shared counts empty', () async {
    final flow = cubit(pairDecision(), attempts: FleetPairingAttempts.shared);
    addTearDown(flow.close);
    await flow.start();
    flow.stepUpVerified();
    final submitted = flow.submitCode('0000-0000-0000-0000');
    final erased = eraseFleetSecretKeys(
      crypto: platform.crypto(),
      pins: FleetSecretPins(
        userId: () => null,
        storage: const FlutterSecureStorage(),
      ),
    );
    await submitted;
    await erased;
    expect(
      FleetPairingAttempts.shared.wrong(
        pairDecision().secret! as FleetSecretPairing,
      ),
      0,
    );
    expect(
      await fleetSecretStorage.read(key: FleetPairingAttempts.storageKey),
      isNull,
    );
    expect(source.answers, isEmpty);
  });
}
