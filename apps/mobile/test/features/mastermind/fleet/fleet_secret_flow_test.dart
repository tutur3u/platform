import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_binding.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'secret_test_support.dart';

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#phone
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FakeSecretPlatform platform;
  late FleetSecretPins pins;
  late RecordingSecretSource source;
  late FleetPairingAttempts attempts;
  var now = DateTime.utc(2026, 11, 22, 10, 5);
  final signerKey =
      (secretFixture['request'] as Map<String, dynamic>)['signerKey'] as String;

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
    now = DateTime.utc(2026, 11, 22, 10, 5);
  });
  tearDown(() => platform.uninstall());

  Future<void> pinActive({String key = '', String? id}) async {
    await pins.putPending(
      machineId: 'skr-m4',
      signerKey: key.isEmpty ? signerKey : key,
      label: 'Skora M4',
      pairingId: id ?? 'pair-0123456789abcdef01234567',
      now: now,
    );
    await pins.activate(
      machineId: 'skr-m4',
      pairingId: id ?? 'pair-0123456789abcdef01234567',
      signerKey: key.isEmpty ? signerKey : key,
    );
  }

  FleetSecretCubit cubit(
    FleetDecision decision, {
    Stream<FleetSnapshot?>? snapshots,
    FleetSnapshot? snapshot,
  }) => FleetSecretCubit(
    decision: decision,
    crypto: platform.crypto(),
    pins: pins,
    source: source,
    accountId: () => 'user-1',
    snapshots: snapshots,
    snapshot: snapshot,
    now: () => now,
    retryDelay: (_) => Duration.zero,
    attempts: attempts,
  );

  Future<FleetSecretState> started(FleetSecretCubit flow) async {
    await flow.start();
    return flow.state;
  }

  group('verification', () {
    test('a pinned, signed, addressed request reaches the step-up', () async {
      await pinActive();
      final flow = cubit(await signedRequestDecision());
      addTearDown(flow.close);
      final state = await started(flow);
      expect(state.phase, FleetSecretPhase.stepUp);
      expect(state.pin?.label, 'Skora M4');
      expect(state.requestCode, isNotNull);
    });

    Future<FleetSecretBlock?> blockOf(FleetDecision decision) async {
      final flow = cubit(decision);
      addTearDown(flow.close);
      final state = await started(flow);
      return state.phase == FleetSecretPhase.blocked ? state.block : null;
    }

    test('refuses a bad signature', () async {
      await pinActive();
      final decision = await signedRequestDecision(
        changes: {'sig': secretFixture['ownerSig']},
        resign: false,
      );
      expect(await blockOf(decision), FleetSecretBlock.badSignature);
    });

    test('refuses a request signed by a key other than the pin', () async {
      await pinActive(key: 'oJql9HpnWYAv-VX43C0qFKXJnSO-l_hkEn_5ODRVpPA');
      expect(
        await blockOf(await signedRequestDecision()),
        FleetSecretBlock.keyChanged,
      );
    });

    test('refuses a machine with only a pending pin', () async {
      await pins.putPending(
        machineId: 'skr-m4',
        signerKey: signerKey,
        label: 'Skora M4',
        pairingId: 'pair-0123456789abcdef01234567',
        now: now,
      );
      expect(
        await blockOf(await signedRequestDecision()),
        FleetSecretBlock.pendingPin,
      );
    });

    test('asks to pair a machine with no pin', () async {
      final flow = cubit(await signedRequestDecision());
      addTearDown(flow.close);
      expect((await started(flow)).phase, FleetSecretPhase.needsPairing);
    });

    test('refuses when this phone is not in the audience', () async {
      await pinActive();
      expect(
        await blockOf(
          await signedRequestDecision(
            changes: {'audience': 'ffffffffffffffffffffffffffffffff'},
          ),
        ),
        FleetSecretBlock.notInAudience,
      );
    });

    test('refuses a decision id that differs from the signed id', () async {
      await pinActive();
      expect(
        await blockOf(
          await signedRequestDecision(id: 'secret-ffffffffffffffffffffffff'),
        ),
        FleetSecretBlock.idMismatch,
      );
    });

    test('refuses a request with under 45 seconds left', () async {
      await pinActive();
      now = DateTime.utc(2026, 11, 22, 10, 9, 16);
      expect(
        await blockOf(await signedRequestDecision()),
        FleetSecretBlock.expiring,
      );
    });

    test('refuses an SSH line that does not quote the remote', () async {
      await pinActive();
      final command = jsonEncode({
        'argv': ['/usr/bin/ssh', 'macstudio1', '--', 'sudo -S'],
        'remote': ['sudo', '-S'],
      });
      expect(
        await blockOf(
          await signedRequestDecision(changes: {'command': command}),
        ),
        FleetSecretBlock.quoting,
      );
    });

    test('offers nothing where the plugin is unsupported', () async {
      platform.supported = false;
      await pinActive();
      expect(
        await blockOf(await signedRequestDecision()),
        FleetSecretBlock.unsupported,
      );
    });
  });

  group('answer', () {
    test('the field opens only after the step-up', () async {
      await pinActive();
      final flow = cubit(await signedRequestDecision());
      addTearDown(flow.close);
      await flow.start();
      final value = Uint8List.fromList(utf8.encode('disposable'));
      await flow.send(value);
      expect(source.answers, isEmpty);
      expect(value.every((b) => b == 0), isTrue);
      flow.stepUpVerified();
      expect(flow.state.phase, FleetSecretPhase.input);
    });

    test('seals, zeroes, signs and posts directly', () async {
      await pinActive();
      final decision = await signedRequestDecision();
      final request = decision.secret! as FleetSecretRequest;
      final flow = cubit(decision);
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      final value = Uint8List.fromList(utf8.encode('disposable-value'));
      await flow.send(value);
      expect(value.every((b) => b == 0), isTrue);
      expect(flow.state.phase, FleetSecretPhase.sent);
      expect(
        bytesHex(platform.sealed.single),
        bytesHex(
          FleetSecretBinding.plaintext(
            Uint8List.fromList(utf8.encode('disposable-value')),
          ),
        ),
      );
      final body = source.answers.single;
      expect(body['action'], 'secret');
      final owner = body['owner']! as Map<String, String>;
      expect(owner['keyId'], secretFixture['ownerKeyId']);
      expect(owner['signedAt'], '2026-11-22T10:05:00.000Z');
      final sealed = body['sealed']! as Map<String, String>;
      final transcript = FleetSecretBinding.ownerTranscript(
        request,
        action: 'secret',
        enc: sealed['enc']!,
        ct: sealed['ct']!,
        signedAt: owner['signedAt']!,
        keyId: owner['keyId']!,
      );
      expect(bytesHex(platform.signedMessages.single), bytesHex(transcript));
      expect(
        jsonEncode(body),
        isNot(contains('disposable-value')),
        reason: 'only ciphertext leaves the phone',
      );
    });

    test('mfa_required keeps the sealed answer and key for a resend', () async {
      await pinActive();
      source.replies.add(FleetSecretSendFailure.mfaRequired);
      final flow = cubit(await signedRequestDecision());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.send(Uint8List.fromList(utf8.encode('disposable')));
      expect(flow.state.phase, FleetSecretPhase.stepUp);
      expect(flow.state.resend, isTrue);
      flow.stepUpVerified();
      await pumpEventQueue();
      expect(flow.state.phase, FleetSecretPhase.sent);
      expect(source.answers, hasLength(2));
      expect(source.answers.first, source.answers.last);
      expect(source.keys.toSet(), hasLength(1));
      expect(platform.sealed, hasLength(1));
    });

    test('retries in memory while Web is unreachable', () async {
      await pinActive();
      source.replies.addAll([
        FleetSecretSendFailure.unavailable,
        FleetSecretSendFailure.unavailable,
      ]);
      final flow = cubit(await signedRequestDecision());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.send(Uint8List.fromList(utf8.encode('disposable')));
      expect(flow.state.phase, FleetSecretPhase.sent);
      expect(source.keys.toSet(), hasLength(1));
    });

    test('409 closes and 422 reads not delivered', () async {
      await pinActive();
      source.replies.add(FleetSecretSendFailure.closed);
      final first = cubit(await signedRequestDecision());
      addTearDown(first.close);
      await first.start();
      first.stepUpVerified();
      await first.send(Uint8List.fromList(utf8.encode('disposable')));
      expect(first.state.phase, FleetSecretPhase.closed);

      source.replies.add(FleetSecretSendFailure.notDelivered);
      final second = cubit(await signedRequestDecision());
      addTearDown(second.close);
      await second.start();
      second.stepUpVerified();
      await second.send(Uint8List.fromList(utf8.encode('disposable')));
      expect(second.state.block, FleetSecretBlock.notDelivered);
    });

    test('the answer never reaches preferences or the outbox', () async {
      await pinActive();
      final flow = cubit(await signedRequestDecision());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.send(Uint8List.fromList(utf8.encode('disposable')));
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getKeys(), isEmpty);
      final stored = await const FlutterSecureStorage().readAll();
      expect(stored.keys, everyElement(startsWith(FleetSecretPins.keyPrefix)));
      expect(stored.values.join(), isNot(contains('sealed')));
    });

    test('decline signs an empty sealed payload', () async {
      await pinActive();
      final flow = cubit(await signedRequestDecision());
      addTearDown(flow.close);
      await flow.start();
      await flow.decline();
      expect(source.answers.single['action'], 'decline');
      expect(source.answers.single.containsKey('sealed'), isFalse);
      expect(flow.state.declined, isTrue);
    });

    test('closes when the decision leaves the snapshot', () async {
      await pinActive();
      final decision = await signedRequestDecision();
      final snapshots = StreamController<FleetSnapshot?>();
      addTearDown(snapshots.close);
      final flow = cubit(decision, snapshots: snapshots.stream);
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      snapshots.add(secretSnapshot());
      await pumpEventQueue();
      expect(flow.state.phase, FleetSecretPhase.closed);
    });

    test(
      'settles only on a machine-signed outcome naming this answer',
      () async {
        await pinActive();
        final decision = await signedRequestDecision();
        final snapshots = StreamController<FleetSnapshot?>();
        addTearDown(snapshots.close);
        final flow = cubit(decision, snapshots: snapshots.stream);
        addTearDown(flow.close);
        await flow.start();
        flow.stepUpVerified();
        await flow.send(Uint8List.fromList(utf8.encode('disposable')));
        snapshots.add(secretSnapshot());
        await pumpEventQueue();
        expect(flow.state.phase, FleetSecretPhase.pickedUp);
        final digest = FleetSecretBinding.sha256Hex(
          platform.signedMessages.single,
        );
        snapshots.add(
          secretSnapshot(
            resolved: [await signedResolved(decision.id, 'delivered', digest)],
          ),
        );
        await pumpEventQueue();
        expect(flow.state.phase, FleetSecretPhase.outcome);
        expect(flow.state.settled?.verified, isTrue);
        expect(flow.state.settled?.mine, isTrue);
      },
    );

    test(
      "Web's pickup receipt marks the answer picked up while still listed",
      () async {
        await pinActive();
        final decision = await signedRequestDecision();
        final snapshots = StreamController<FleetSnapshot?>();
        addTearDown(snapshots.close);
        final flow = cubit(decision, snapshots: snapshots.stream);
        addTearDown(flow.close);
        await flow.start();
        flow.stepUpVerified();
        await flow.send(Uint8List.fromList(utf8.encode('disposable')));
        Map<String, dynamic> receipt({required bool pickedUp}) => {
          decision.id: {
            'action': 'secret',
            'revision': 1,
            'answeredAt': '2026-11-22T10:05:00.000Z',
            'pickedUp': pickedUp,
          },
        };
        final listed = [decisionJson(decision)];
        snapshots.add(
          secretSnapshot(decisions: listed, answers: receipt(pickedUp: false)),
        );
        await pumpEventQueue();
        expect(flow.state.phase, FleetSecretPhase.sent);
        snapshots.add(
          secretSnapshot(decisions: listed, answers: receipt(pickedUp: true)),
        );
        await pumpEventQueue();
        expect(flow.state.phase, FleetSecretPhase.pickedUp);
      },
    );

    test(
      'an outcome for another answer, or unsigned, is not trusted',
      () async {
        await pinActive();
        final decision = await signedRequestDecision();
        final other = await signedResolved(decision.id, 'delivered', 'a' * 64);
        final tampered = {
          ...other,
          'secretOutcome': {
            ...(other['secretOutcome'] as Map<String, dynamic>),
            'outcome': 'failed',
          },
        };
        for (final (resolved, verified) in [(other, true), (tampered, false)]) {
          final snapshots = StreamController<FleetSnapshot?>();
          addTearDown(snapshots.close);
          final flow = cubit(decision, snapshots: snapshots.stream);
          addTearDown(flow.close);
          await flow.start();
          flow.stepUpVerified();
          await flow.send(Uint8List.fromList(utf8.encode('disposable')));
          snapshots.add(secretSnapshot(resolved: [resolved]));
          await pumpEventQueue();
          expect(flow.state.phase, FleetSecretPhase.outcome);
          expect(flow.state.settled?.verified, verified);
          expect(flow.state.settled?.mine, isFalse);
        }
      },
    );

    test('an erase closes the flow', () async {
      await pinActive();
      final flow = cubit(await signedRequestDecision());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await eraseFleetSecretKeys(crypto: platform.crypto(), pins: pins);
      expect(flow.state.phase, FleetSecretPhase.closed);
      expect(await pins.read(), isEmpty);
      expect(platform.deletedAccounts, [null]);
    });

    Future<void> eraseElsewhere() => eraseFleetSecretKeys(
      crypto: platform.crypto(),
      pins: FleetSecretPins(
        userId: () => null,
        storage: const FlutterSecureStorage(),
      ),
    );

    test('an erase stops the retries of an answer in flight', () async {
      await pinActive();
      source.replies.addAll(List.filled(3, FleetSecretSendFailure.unavailable));
      final flow = FleetSecretCubit(
        decision: await signedRequestDecision(),
        crypto: platform.crypto(),
        pins: pins,
        source: source,
        accountId: () => 'user-1',
        now: () => now,
        retryDelay: (_) {
          unawaited(eraseElsewhere());
          return Duration.zero;
        },
        attempts: attempts,
      );
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.send(Uint8List.fromList(utf8.encode('disposable')));
      await pumpEventQueue();
      expect(source.answers, hasLength(1));
      expect(flow.state.phase, FleetSecretPhase.closed);
    });

    test('a pin write queued before an erase does not outlive it', () async {
      final write = pins.putPending(
        machineId: 'skr-m4',
        signerKey: signerKey,
        label: 'Skora M4',
        pairingId: 'pair-0123456789abcdef01234567',
        now: now,
      );
      await Future.wait([write, eraseElsewhere()]);
      expect(await pins.read(), isEmpty);
    });

    test('a pin write for another account is dropped', () async {
      await pins.putPending(
        machineId: 'skr-m4',
        signerKey: signerKey,
        label: 'Skora M4',
        pairingId: 'pair-0123456789abcdef01234567',
        now: now,
        account: 'user-2',
      );
      expect(await pins.read(), isEmpty);
      expect(
        await FleetSecretPins(
          userId: () => 'user-2',
          storage: const FlutterSecureStorage(),
        ).read(),
        isEmpty,
      );
    });

    test('an erase during pairing writes no pin and sends nothing', () async {
      var macs = 0;
      platform.onCall = (method) async {
        if (method == 'hmac' && ++macs == 2) await eraseElsewhere();
      };
      final flow = cubit(pairDecision());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.submitCode('008j 4ct4 ank7 f24s');
      expect(macs, 2);
      expect(flow.state.phase, FleetSecretPhase.closed);
      expect(source.answers, isEmpty);
      expect(await pins.read(), isEmpty);
    });
  });

  group('pairing', () {
    test(
      'a correct code records a pending pin and sends the owner MAC',
      () async {
        final pairingJson = secretFixture['pairing'] as Map<String, dynamic>;
        final decision = pairDecision();
        final snapshots = StreamController<FleetSnapshot?>();
        addTearDown(snapshots.close);
        final flow = cubit(decision, snapshots: snapshots.stream);
        addTearDown(flow.close);
        await flow.start();
        expect(flow.state.phase, FleetSecretPhase.stepUp);
        expect(flow.state.fingerprint, secretFixture['machineFingerprint']);
        flow.stepUpVerified();
        await flow.submitCode('008j 4ct4 ank7 f24s');
        expect(flow.state.phase, FleetSecretPhase.sent);
        expect(source.answers.single, {
          'action': 'pair',
          'pair': {
            'ownerKey': pairingJson['ownerKey'],
            'ownerMac': pairingJson['ownerMac'],
          },
        });
        expect((await pins.read())['skr-m4']?.active, isFalse);
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
        expect((await pins.read())['skr-m4']?.active, isTrue);
      },
    );

    test('five wrong codes lock the card', () async {
      final flow = cubit(pairDecision());
      addTearDown(flow.close);
      await flow.start();
      flow.stepUpVerified();
      await flow.submitCode('too-short');
      expect(flow.state.codeError, FleetSecretCodeError.malformed);
      for (var i = 0; i < 4; i++) {
        await flow.submitCode('0000-0000-0000-0000');
        expect(flow.state.codeError, FleetSecretCodeError.wrong);
        expect(flow.state.codesLeft, 4 - i);
      }
      await flow.submitCode('0000-0000-0000-0000');
      expect(flow.state.block, FleetSecretBlock.locked);
      expect(source.answers, isEmpty);
      final again = cubit(pairDecision());
      addTearDown(again.close);
      expect((await started(again)).block, FleetSecretBlock.locked);
    });

    test('a request activates a pending pin the machine confirmed', () async {
      await pins.putPending(
        machineId: 'skr-m4',
        signerKey: signerKey,
        label: 'Skora M4',
        pairingId: 'pair-0123456789abcdef01234567',
        now: now,
      );
      final decision = await signedRequestDecision();
      final flow = cubit(
        decision,
        snapshot: secretSnapshot(
          decisions: [decisionJson(decision)],
          resolved: [
            await signedResolved(
              'pair-0123456789abcdef01234567',
              'paired',
              secretFixture['ownerKeyId'] as String,
            ),
          ],
        ),
      );
      addTearDown(flow.close);
      expect((await started(flow)).phase, FleetSecretPhase.stepUp);
    });
  });
}
