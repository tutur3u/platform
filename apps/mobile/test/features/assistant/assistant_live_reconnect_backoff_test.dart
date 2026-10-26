import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';

import 'assistant_live_reconnect_harness.dart';

void main() {
  test('reconnect delays back off and stay capped', () {
    expect(
      [for (var i = 0; i < 7; i++) assistantLiveReconnectDelay(i)],
      const [
        Duration(milliseconds: 800),
        Duration(milliseconds: 1600),
        Duration(milliseconds: 3200),
        Duration(milliseconds: 6400),
        Duration(milliseconds: 12800),
        Duration(seconds: 15),
        Duration(seconds: 15),
      ],
    );
  });

  testWidgets('a flapping provider stops after the reconnect budget', (
    tester,
  ) async {
    final p = LiveDroppingProvider();
    addTearDown(p.close);
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await advanceLive(tester, const Duration(minutes: 3));
    // One user start plus the bounded automatic reconnects, then Retry.
    expect(p.tokens, 1 + assistantLiveMaxReconnectAttempts);
    expect(p.cubit.state.status, AssistantLiveConnectionStatus.error);
    expect(p.cubit.state.error, 'live_reconnect_exhausted');
    await advanceLive(tester, const Duration(minutes: 3));
    expect(p.tokens, 1 + assistantLiveMaxReconnectAttempts);
  });

  testWidgets('drops after a stable connection keep reconnecting', (
    tester,
  ) async {
    final p = LiveDroppingProvider()..uptime = const Duration(minutes: 10);
    addTearDown(p.close);
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await advanceLive(tester, const Duration(seconds: 30));
    // Routine provider GoAways after long healthy stretches never exhaust.
    expect(p.tokens, greaterThan(1 + assistantLiveMaxReconnectAttempts));
    expect(p.cubit.state.error, isNot('live_reconnect_exhausted'));
    p.dropping = false;
    await advanceLive(tester, const Duration(seconds: 5));
  });

  testWidgets('a user Retry after exhaustion gets a fresh budget', (
    tester,
  ) async {
    final p = LiveDroppingProvider();
    addTearDown(p.close);
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await advanceLive(tester, const Duration(minutes: 3));
    expect(p.tokens, 1 + assistantLiveMaxReconnectAttempts);
    unawaited(p.cubit.prepareSession(wsId: 'ws', reconnect: true));
    await advanceLive(tester, const Duration(minutes: 3));
    expect(p.tokens, 2 * (1 + assistantLiveMaxReconnectAttempts));
    expect(p.cubit.state.error, 'live_reconnect_exhausted');
  });

  testWidgets('a drop while the reconnect binds history still reconnects', (
    tester,
  ) async {
    final p = LiveDroppingProvider()..heldBinding = Completer<void>();
    addTearDown(p.close);
    // Every attempt connects, then drops while its history binding is held.
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await advanceLive(tester, const Duration(minutes: 3));
    expect(p.tokens, 1 + assistantLiveMaxReconnectAttempts);
    expect(p.cubit.state.error, 'live_reconnect_exhausted');
    await p.settle(tester);
  });

  for (final retirement in ['disconnect', 'scope change']) {
    testWidgets('a retired reconnect cannot swallow a new call drop after '
        '$retirement', (tester) async {
      final p = LiveDroppingProvider();
      addTearDown(p.close);
      unawaited(p.cubit.prepareSession(wsId: 'ws'));
      // The first call drops; its reconnect waits 0.8 s.
      await advanceLive(tester, const Duration(milliseconds: 1200));
      expect(p.tokens, 1);
      if (retirement == 'disconnect') {
        await p.cubit.disconnect();
      } else {
        p.scope++;
      }
      // A new call drops before the retired delay would have expired.
      p.dropAfter = const Duration(milliseconds: 100);
      unawaited(p.cubit.prepareSession(wsId: 'ws'));
      await advanceLive(tester, const Duration(seconds: 3));
      expect(p.tokens, greaterThan(2), reason: 'the new call reconnects');
      await p.settle(tester);
    });
  }

  testWidgets('closing Live retires a pending reconnect timer', (tester) async {
    final p = LiveDroppingProvider();
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await advanceLive(tester, const Duration(milliseconds: 1200));
    expect(p.tokens, 1);
    // A reconnect is pending; closing must cancel it, not leave a timer.
    // Native teardown needs real event-loop turns, but fake time must not
    // reach the 0.8 s delay, so the pending-timer invariant can catch it.
    var closed = false;
    unawaited(p.cubit.close().whenComplete(() => closed = true));
    for (var i = 0; i < 40 && !closed; i++) {
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump(Duration.zero);
    }
    expect(closed, isTrue);
    await p.events.close();
    expect(p.tokens, 1);
  });

  testWidgets('an old reconnect cannot supersede a user start that is still '
      'waiting on persistence', (tester) async {
    final p = LiveDroppingProvider()
      ..dropping = false
      ..heldPersistence = Completer<void>();
    addTearDown(p.close);
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await advanceLive(tester, const Duration(milliseconds: 400));
    expect(p.cubit.state.status, AssistantLiveConnectionStatus.connected);
    // A finished turn leaves its save pending, then the provider drops.
    p.events
      ..add(
        const AssistantLiveSocketTranscriptDelta(
          text: 'Saved answer',
          isUserInput: false,
        ),
      )
      ..add(const AssistantLiveSocketTurnCompleted())
      ..add(const AssistantLiveSocketClosed('provider dropped'));
    await tester.pump();
    // The user starts again before the 0.8 s reconnect fires; the start waits
    // on the pending save before it takes a request version.
    int? userResult = -1;
    unawaited(
      p.cubit
          .prepareSession(wsId: 'ws', model: 'user-model')
          .then((value) => userResult = value),
    );
    await advanceLive(tester, const Duration(seconds: 2));
    p.heldPersistence!.complete();
    await advanceLive(tester, const Duration(seconds: 2));
    expect(p.requestedModels.skip(1), ['user-model']);
    expect(userResult, isNotNull, reason: 'the user start was superseded');
    expect(p.cubit.state.status, AssistantLiveConnectionStatus.connected);
    await p.settle(tester);
  });

  testWidgets('a drop during a slow End Call teardown never reconnects', (
    tester,
  ) async {
    final p = LiveDroppingProvider()..dropping = false;
    addTearDown(p.close);
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await advanceLive(tester, const Duration(milliseconds: 400));
    expect(p.cubit.state.status, AssistantLiveConnectionStatus.connected);
    p.heldRecorderStop = Completer<void>();
    var ended = false;
    unawaited(
      p.cubit.disconnect(finishTurn: true).whenComplete(() => ended = true),
    );
    await tester.pump();
    // The provider drops while native teardown is still in progress.
    p.events.add(const AssistantLiveSocketClosed('provider dropped'));
    await advanceLive(tester, const Duration(seconds: 3));
    p.heldRecorderStop!.complete();
    await advanceLive(tester, const Duration(seconds: 3));
    expect(ended, isTrue);
    expect(p.tokens, 1, reason: 'End Call was superseded by a reconnect');
    expect(p.cubit.state.status, AssistantLiveConnectionStatus.disconnected);
    expect(p.cubit.state.hasEnded, isTrue);
    await p.settle(tester);
  });

  testWidgets('a drop of the old session after a user start began cannot '
      'supersede it', (tester) async {
    final p = LiveDroppingProvider()
      ..dropping = false
      ..heldPersistence = Completer<void>();
    addTearDown(p.close);
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
    await tester.pump();
    // The user starts first; the old session drops only afterwards.
    int? userResult = -1;
    unawaited(
      p.cubit
          .prepareSession(wsId: 'ws', model: 'u2')
          .then((value) => userResult = value),
    );
    await tester.pump();
    p.events.add(const AssistantLiveSocketClosed('provider dropped'));
    await advanceLive(tester, const Duration(seconds: 2));
    p.heldPersistence!.complete();
    await advanceLive(tester, const Duration(seconds: 2));
    expect(p.requestedModels.skip(1), ['u2']);
    expect(userResult, isNotNull, reason: 'the user start was superseded');
    expect(p.cubit.state.status, AssistantLiveConnectionStatus.connected);
    await p.settle(tester);
  });

  testWidgets('an automatic reconnect waiting on persistence cannot connect '
      'during a slow End Call', (tester) async {
    final p = LiveDroppingProvider()
      ..dropping = false
      ..heldPersistence = Completer<void>();
    addTearDown(p.close);
    unawaited(p.cubit.prepareSession(wsId: 'ws', model: 'u1'));
    await advanceLive(tester, const Duration(milliseconds: 400));
    p.events
      ..add(
        const AssistantLiveSocketTranscriptDelta(
          text: 'Saved answer',
          isUserInput: false,
        ),
      )
      ..add(const AssistantLiveSocketTurnCompleted())
      ..add(const AssistantLiveSocketClosed('provider dropped'));
    // The reconnect fires and waits on the pending save.
    await advanceLive(tester, const Duration(seconds: 1));
    expect(p.tokens, 1);
    p.heldRecorderStop = Completer<void>();
    var ended = false;
    unawaited(
      p.cubit.disconnect(finishTurn: true).whenComplete(() => ended = true),
    );
    await tester.pump();
    p.heldPersistence!.complete();
    await advanceLive(tester, const Duration(seconds: 3));
    p.heldRecorderStop!.complete();
    await advanceLive(tester, const Duration(seconds: 3));
    expect(ended, isTrue);
    expect(p.tokens, 1, reason: 'the in-flight reconnect fetched a token');
    expect(p.connectSteps, hasLength(1));
    expect(p.cubit.state.status, AssistantLiveConnectionStatus.disconnected);
    expect(p.cubit.state.hasEnded, isTrue);
    await p.settle(tester);
  });
}
