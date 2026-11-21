import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_outbox_store.dart';

import '../../../helpers/mastermind_fleet_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#answer-delivery
void main() {
  late FakeFleetSource source;
  late List<(Duration, void Function())> timers;

  FleetCubit cubit({FleetOutboxStore? outbox}) => FleetCubit(
    source: source,
    outbox: outbox,
    newKey: () => 'key-1',
    clock: () => fleetTestNow,
    periodic: (_, _) => Timer(Duration.zero, () {}),
    timer: (delay, callback) {
      timers.add((delay, callback));
      return Timer(const Duration(days: 1), () {});
    },
  );

  Future<void> fire() async {
    timers.removeLast().$2();
    await pumpEventQueue();
  }

  setUp(() {
    source = FakeFleetSource();
    timers = [];
  });

  test('a 503 retries on its own with the same key and backoff', () async {
    source.answerError = const ApiException(message: 'x', statusCode: 503);
    final fleet = cubit();
    await fleet.refresh();
    await fleet.answer('pool-switch', FleetAnswerAction.reply, text: 'Yes');
    final pending = fleet.state.pending['pool-switch']!;
    expect(pending.status, FleetSendStatus.retrying);
    expect(pending.nextAttemptAt, fleetTestNow.add(const Duration(seconds: 5)));

    await fire();
    await fire();
    await fire();
    expect(timers.single.$1, const Duration(minutes: 2));
    expect(timers.length, 1);

    source.answerError = null;
    await fire();
    expect(source.answers.map((a) => a['key']).toSet(), {'key-1'});
    expect(source.answers, hasLength(5));
    expect(fleet.state.pending, isEmpty);
    expect(fleet.state.snapshot!.answers['pool-switch'], isNotNull);
    await fleet.close();
  });

  test('the backoff runs 5 s, 15 s, 1 min, then every 2 min', () {
    expect(
      [for (var n = 1; n <= 6; n++) fleetRetryDelay(n).inSeconds],
      [5, 15, 60, 120, 120, 120],
    );
  });

  test('409 decision_closed settles as closed and stops retrying', () async {
    source.answerError = const ApiException(
      message: 'decision_closed',
      statusCode: 409,
    );
    final fleet = cubit();
    await fleet.refresh();
    final fetches = source.fetches;
    await fleet.answer('pool-switch', FleetAnswerAction.hold);
    final pending = fleet.state.pending['pool-switch']!;
    expect(pending.status, FleetSendStatus.closed);
    expect(pending.reason, 'decision_closed');
    expect(timers, isEmpty);
    await pumpEventQueue();
    expect(source.fetches, fetches + 1, reason: 'refetch what closed it');
    await fleet.close();
  });

  test('422 is terminal with its reason', () async {
    source.answerError = const ApiException(
      message: 'unknown_option',
      statusCode: 422,
    );
    final fleet = cubit();
    await fleet.refresh();
    await fleet.answer('pool-switch', FleetAnswerAction.approve);
    final pending = fleet.state.pending['pool-switch']!;
    expect(pending.status, FleetSendStatus.failed);
    expect(pending.reason, 'unknown_option');
    expect(timers, isEmpty);
    await fleet.close();
  });

  test('an abuse challenge retries slowly, then gives up', () async {
    source.answerError = const ApiException(
      message: 'challenge',
      statusCode: 403,
      isVerificationRequired: true,
    );
    final fleet = cubit();
    await fleet.refresh();
    await fleet.answer('pool-switch', FleetAnswerAction.hold);
    expect(fleet.state.snapshot, isNotNull, reason: 'not lost access');
    final first = fleet.state.pending['pool-switch']!;
    expect(first.status, FleetSendStatus.retrying);
    expect(first.reason, 'verification_required');
    expect(timers.single.$1, fleetChallengeRetryDelay);
    for (var i = 1; i < fleetChallengeRetryLimit; i++) {
      await fire();
    }
    await fire();
    expect(fleet.state.pending['pool-switch']!.status, FleetSendStatus.failed);
    expect(timers, isEmpty);
    await fleet.close();
  });

  test('resume and coming back online resend at once', () async {
    source.answerError = const ApiException.transport(message: 'offline');
    final fleet = cubit();
    await fleet.refresh();
    await fleet.answer('pool-switch', FleetAnswerAction.hold);
    source.answerError = null;
    fleet
      ..setForeground(foreground: false)
      ..setForeground(foreground: true);
    await pumpEventQueue();
    expect(source.answers.map((a) => a['key']), ['key-1', 'key-1']);
    expect(fleet.state.pending, isEmpty);
    await fleet.close();
  });

  test('an outstanding answer survives a restart and goes out', () async {
    final outbox = MemoryFleetOutboxStore();
    source.answerError = const ApiException(message: 'x', statusCode: 502);
    final first = cubit(outbox: outbox);
    await first.refresh();
    await first.answer('pool-switch', FleetAnswerAction.reply, text: 'Yes');
    await first.close();
    expect((await outbox.read())['pool-switch']?.text, 'Yes');

    source.answerError = null;
    final second = cubit(outbox: outbox)..attach();
    await pumpEventQueue();
    expect(source.answers.map((a) => a['key']), ['key-1', 'key-1']);
    expect(source.answers.last['text'], 'Yes');
    expect(await outbox.read(), isEmpty);
    await second.close();
  });

  test('a decision leaving the snapshot stops its retry', () async {
    source.answerError = const ApiException.transport(message: 'offline');
    final fleet = cubit();
    await fleet.refresh();
    await fleet.answer('pool-switch', FleetAnswerAction.reply, text: 'Later');
    await fleet.answer('ship-fleet-sync', FleetAnswerAction.hold);
    source.json = fleetSampleJson(
      decisions: const [],
      resolved: [
        {
          'id': 'ship-fleet-sync',
          'title': 'Ship fleet sync to production?',
          'answeredVia': 'whatsapp',
          'resolvedAt': '2026-11-20T03:01:00.000Z',
        },
      ],
    );
    await fleet.refresh();
    final reply = fleet.state.pending['pool-switch']!;
    expect(reply.status, FleetSendStatus.closed);
    expect(reply.title, 'Move the M4 lanes to the second pool?');
    expect(
      fleet.state.pending.containsKey('ship-fleet-sync'),
      isFalse,
      reason: 'resolved history already shows it; no words were lost',
    );
    final sent = source.answers.length;
    timers.clear();
    fleet.retryNow();
    await pumpEventQueue();
    expect(source.answers, hasLength(sent));
    fleet.dismiss('pool-switch');
    expect(fleet.state.pending, isEmpty);
    await fleet.close();
  });

  test('a decision listed as resolved is never open', () {
    final snapshot = FleetSnapshot.parse(
      fleetSampleJson(
        resolved: [
          {
            'id': 'ship-fleet-sync',
            'title': 'Ship fleet sync to production?',
            'answeredVia': 'whatsapp',
            'resolvedAt': '2026-11-20T03:01:00.000Z',
          },
        ],
      ),
    );
    expect(snapshot.decisions.map((d) => d.id), ['pool-switch']);
    expect(snapshot.resolved.single.answeredVia, FleetAnswerChannel.whatsapp);
  });

  test('a Mastermind push refreshes the fleet', () async {
    final pushes = StreamController<void>();
    final fleet = cubit();
    final harness = MastermindViewHarness(
      fleet: fleet,
      mastermindPushes: pushes.stream,
    );
    await fleet.refresh();
    final before = source.fetches;
    pushes.add(null);
    await pumpEventQueue();
    expect(source.fetches, before + 1);
    await harness.dispose();
    await pushes.close();
  });

  test('a long outage does not spend the challenge budget', () async {
    source.answerError = const ApiException(message: 'x', statusCode: 503);
    final fleet = cubit();
    await fleet.refresh();
    await fleet.answer('pool-switch', FleetAnswerAction.hold);
    for (var i = 0; i < fleetChallengeRetryLimit + 5; i++) {
      await fire();
    }
    source.answerError = const ApiException(
      message: 'challenge',
      statusCode: 403,
      isVerificationRequired: true,
    );
    await fire();
    final pending = fleet.state.pending['pool-switch']!;
    expect(pending.status, FleetSendStatus.retrying);
    expect(pending.challenges, 1);
    await fleet.close();
  });

  test('a 403 on a fetch keeps unsent answers', () async {
    final outbox = MemoryFleetOutboxStore();
    source.answerError = const ApiException.transport(message: 'offline');
    final fleet = cubit(outbox: outbox);
    await fleet.refresh();
    await fleet.answer('pool-switch', FleetAnswerAction.reply, text: 'Yes');
    source.fetchError = const ApiException(message: 'no', statusCode: 403);
    await fleet.refresh();
    expect(fleet.state.snapshot, isNull);
    expect(fleet.state.pending['pool-switch']?.text, 'Yes');
    expect((await outbox.read())['pool-switch']?.text, 'Yes');
    await fleet.close();
  });

  test(
    'a restored answer whose decision closed on mobile is not resent',
    () async {
      final outbox = MemoryFleetOutboxStore();
      await outbox.write({
        'pool-switch': FleetPendingAnswer(
          action: FleetAnswerAction.reply,
          idempotencyKey: 'key-0',
          status: FleetSendStatus.retrying,
          createdAt: fleetTestNow,
          text: 'Yes',
        ),
      });
      source.json = fleetSampleJson(
        resolved: [
          {
            'id': 'pool-switch',
            'title': 'Move the M4 lanes to the second pool?',
            'answeredVia': 'mobile',
            'resolvedAt': '2026-11-20T03:01:00.000Z',
          },
        ],
      );
      final fleet = cubit(outbox: outbox)..attach();
      await pumpEventQueue();
      expect(source.answers, isEmpty, reason: 'its lost response landed');
      expect(fleet.state.pending, isEmpty);
      await fleet.close();
    },
  );

  test('the outbox file stays with the account that read it', () async {
    final dir = await Directory.systemTemp.createTemp('fleet-outbox');
    addTearDown(() => dir.delete(recursive: true));
    String? user = 'owner-a';
    final store = FileFleetOutboxStore(
      userId: () => user,
      baseDirectory: () async => dir,
    );
    final entry = FleetPendingAnswer(
      action: FleetAnswerAction.hold,
      idempotencyKey: 'key-1',
      status: FleetSendStatus.retrying,
      createdAt: fleetTestNow,
    );
    await store.read();
    await store.write({'pool-switch': entry});
    expect((await store.read()).keys, ['pool-switch']);

    user = 'owner-b';
    await store.write({'other': entry});
    await store.clear();
    user = 'owner-a';
    expect(await store.read(), isEmpty, reason: 'clear erased owner-a');
    user = 'owner-b';
    expect(await store.read(), isEmpty, reason: 'nothing reached owner-b');
  });
}
