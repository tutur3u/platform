import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';

import '../../../helpers/mastermind_fleet_fixture.dart';

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync
void main() {
  group('FleetSnapshot.parse', () {
    test('reads the envelope and skips unusable rows', () {
      final snapshot = FleetSnapshot.parse(fleetSampleJson());
      expect(snapshot.lanes, hasLength(7));
      expect(snapshot.machines.map((m) => m.id), contains('macbook-m3'));
      expect(snapshot.counts.failed, 1);
      expect(snapshot.orchestratorState, FleetOrchestratorState.running);
      expect(snapshot.decisions.first.recommended?.label, 'Ship now');
    });

    test('orders open decisions by urgency and hides answered ones', () {
      final snapshot = FleetSnapshot.parse(
        fleetSampleJson(
          answers: {
            'pool-switch': {
              'action': 'hold',
              'revision': 1,
              'answeredAt': '2026-11-20T02:59:00.000Z',
              'pickedUp': true,
            },
          },
        ),
      );
      expect(snapshot.openDecisions.map((d) => d.id), ['ship-fleet-sync']);
      expect(snapshot.answers['pool-switch']?.pickedUp, isTrue);
    });

    test('refuses an unsupported version', () {
      final json = fleetSampleJson();
      (json['state'] as Map<String, dynamic>)['version'] = 2;
      expect(() => FleetSnapshot.parse(json), throwsFormatException);
    });
  });

  group('FleetCubit', () {
    test('loads, then keeps held data when a refresh fails', () async {
      final source = FakeFleetSource();
      final cubit = FleetCubit(source: source);
      await cubit.refresh();
      expect(cubit.state.status, FleetLoadStatus.ready);

      source.fetchError = const ApiException.transport(message: 'offline');
      await cubit.refresh();
      expect(cubit.state.snapshot, isNotNull);
      expect(cubit.state.failure, FleetFailure.unavailable);

      source.fetchError = null;
      await cubit.refresh();
      expect(cubit.state.failure, isNull);
      await cubit.close();
    });

    test('drops held data when access is lost', () async {
      final source = FakeFleetSource();
      final cubit = FleetCubit(source: source);
      await cubit.refresh();
      source.fetchError = const ApiException(message: 'no', statusCode: 403);
      await cubit.refresh();
      expect(cubit.state.snapshot, isNull);
      expect(cubit.state.failure, FleetFailure.forbidden);
      await cubit.close();
    });

    test('polls only while attached and in the foreground', () async {
      final source = FakeFleetSource();
      final timers = <_ManualTimer>[];
      final cubit = FleetCubit(
        source: source,
        periodic: (interval, tick) {
          final timer = _ManualTimer(tick);
          timers.add(timer);
          return timer;
        },
      )..attach();
      await pumpEventQueue();
      expect(source.fetches, 1);
      timers.last.fire();
      await pumpEventQueue();
      expect(source.fetches, 2);

      cubit.setForeground(foreground: false);
      expect(timers.every((t) => !t.isActive), isTrue);

      cubit.setForeground(foreground: true);
      await pumpEventQueue();
      expect(source.fetches, 3, reason: 'resume refreshes at once');
      expect(timers.last.isActive, isTrue);

      cubit.detach();
      expect(timers.every((t) => !t.isActive), isTrue);
      await cubit.close();
    });

    test('merges an answer receipt and closes the decision', () async {
      final source = FakeFleetSource();
      final cubit = FleetCubit(source: source, newKey: () => 'key-1');
      await cubit.refresh();
      await cubit.answer(
        'ship-fleet-sync',
        FleetAnswerAction.approve,
        optionId: 'now',
      );
      expect(source.answers.single['key'], 'key-1');
      expect(source.answers.single['optionId'], 'now');
      expect(cubit.state.pending, isEmpty);
      expect(cubit.state.snapshot!.openDecisions.map((d) => d.id), [
        'pool-switch',
      ]);
      await cubit.close();
    });

    test('a failed answer keeps its key for Retry', () async {
      final source = FakeFleetSource()
        ..answerError = const ApiException.transport(message: 'offline');
      var n = 0;
      final cubit = FleetCubit(source: source, newKey: () => 'key-${++n}');
      await cubit.refresh();
      await cubit.answer('pool-switch', FleetAnswerAction.reply, text: 'Yes');
      expect(
        cubit.state.pending['pool-switch']?.status,
        FleetSendStatus.failed,
      );

      source.answerError = null;
      await cubit.retry('pool-switch');
      expect(source.answers.map((a) => a['key']), ['key-1', 'key-1']);
      expect(source.answers.last['text'], 'Yes');
      expect(cubit.state.snapshot!.answers['pool-switch'], isNotNull);
      await cubit.close();
    });

    test('clear forgets the snapshot and late results', () async {
      final source = FakeFleetSource();
      final cubit = FleetCubit(source: source);
      final pending = cubit.refresh();
      cubit.clear();
      await pending;
      expect(cubit.state.snapshot, isNull);
      expect(cubit.state.status, FleetLoadStatus.initial);
      await cubit.close();
    });
  });
}

final class _ManualTimer implements Timer {
  _ManualTimer(this._tick);

  final void Function(Timer) _tick;
  bool _active = true;

  @override
  bool get isActive => _active;

  @override
  int get tick => 0;

  @override
  void cancel() => _active = false;

  void fire() => _tick(this);
}
