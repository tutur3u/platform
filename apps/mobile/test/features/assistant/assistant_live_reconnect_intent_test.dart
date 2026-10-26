import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';

import 'assistant_live_reconnect_harness.dart';

/// One user or provider action in a Live interleaving.
enum _Step { drop, start, end, close, settleSave, timer }

List<List<_Step>> _orderings(List<_Step> steps) {
  if (steps.length <= 1) return [steps];
  return [
    for (final (index, step) in steps.indexed)
      for (final rest in _orderings([...steps]..removeAt(index)))
        [step, ...rest],
  ];
}

Future<void> _flush(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.pump();
  }
}

/// Starts a live call whose finished turn is still saving, so later starts
/// wait on persistence, and whose input teardown is slow, so End Call waits.
Future<LiveDroppingProvider> _liveCallWithPendingSave(
  WidgetTester tester,
) async {
  final p = LiveDroppingProvider()
    ..dropping = false
    ..heldPersistence = Completer<void>();
  unawaited(p.cubit.prepareSession(wsId: 'ws', model: 'u1'));
  await advanceLive(tester, const Duration(milliseconds: 400));
  expect(p.cubit.state.status, AssistantLiveConnectionStatus.connected);
  p.events
    ..add(
      const AssistantLiveSocketTranscriptDelta(
        text: 'Saved answer',
        isUserInput: false,
      ),
    )
    ..add(const AssistantLiveSocketTurnCompleted());
  await _flush(tester);
  p.heldRecorderStop = Completer<void>();
  return p;
}

Future<void> _run(
  WidgetTester tester,
  LiveDroppingProvider p,
  List<_Step> ordering,
) async {
  for (final (index, step) in ordering.indexed) {
    p.step = index + 1;
    switch (step) {
      case _Step.drop:
        p.events.add(const AssistantLiveSocketClosed('provider dropped'));
        await _flush(tester);
      case _Step.start:
        unawaited(p.cubit.prepareSession(wsId: 'ws', model: 'u2'));
        await _flush(tester);
      case _Step.end:
        unawaited(p.cubit.disconnect(finishTurn: true));
        await _flush(tester);
      case _Step.close:
        unawaited(p.cubit.close());
        await _flush(tester);
      case _Step.settleSave:
        _release(p);
        await _flush(tester);
      case _Step.timer:
        await advanceLive(tester, const Duration(seconds: 1));
    }
  }
  p.step = ordering.length + 1;
}

void _release(LiveDroppingProvider p) {
  for (final held in [p.heldPersistence, p.heldRecorderStop]) {
    if (held != null && !held.isCompleted) held.complete();
  }
}

String _name(List<_Step> ordering) =>
    ordering.map((step) => step.name).join(' > ');

void main() {
  final endOrderings = _orderings(const [
    _Step.drop,
    _Step.start,
    _Step.end,
    _Step.settleSave,
    _Step.timer,
  ]);
  for (final ordering in endOrderings) {
    testWidgets('latest intent wins: ${_name(ordering)}', (tester) async {
      final p = await _liveCallWithPendingSave(tester);
      addTearDown(p.close);
      await _run(tester, p, ordering);
      await advanceLive(tester, const Duration(seconds: 30));
      final endStep = ordering.indexOf(_Step.end) + 1;
      final startStep = ordering.indexOf(_Step.start) + 1;
      if (endStep > startStep) {
        // End Call is the latest intent: nothing connects after it.
        expect(p.tokenSteps.where((t) => t.step >= endStep), isEmpty);
        expect(p.connectSteps.where((s) => s >= endStep), isEmpty);
        expect(
          p.cubit.state.status,
          AssistantLiveConnectionStatus.disconnected,
        );
        expect(p.cubit.state.hasEnded, isTrue);
      } else {
        // The user start is the latest intent: only it may fetch tokens.
        final later = p.tokenSteps.where((t) => t.step >= startStep);
        expect(later, isNotEmpty);
        expect(later.map((t) => t.model), everyElement('u2'));
        expect(p.cubit.state.status, AssistantLiveConnectionStatus.connected);
      }
      await p.settle(tester);
    });
  }

  final closeOrderings = _orderings(const [
    _Step.drop,
    _Step.start,
    _Step.close,
    _Step.settleSave,
    _Step.timer,
  ]);
  for (final ordering in closeOrderings) {
    testWidgets('close is final: ${_name(ordering)}', (tester) async {
      final p = await _liveCallWithPendingSave(tester);
      await _run(tester, p, ordering);
      final closeStep = ordering.indexOf(_Step.close) + 1;
      _release(p);
      // Native teardown needs real event-loop turns to finish closing.
      for (var i = 0; i < 40 && !p.cubit.isClosed; i++) {
        await tester.runAsync(() => Future<void>.delayed(Duration.zero));
        await tester.pump(const Duration(milliseconds: 100));
      }
      await advanceLive(tester, const Duration(seconds: 30));
      expect(p.cubit.isClosed, isTrue);
      expect(p.tokenSteps.where((t) => t.step >= closeStep), isEmpty);
      expect(p.connectSteps.where((s) => s >= closeStep), isEmpty);
      await p.events.close();
    });
  }
}
