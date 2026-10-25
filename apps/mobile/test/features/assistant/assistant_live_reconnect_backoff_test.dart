import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements AssistantLiveRepository {}

class _Player extends Mock implements AssistantLiveAudioPlayer {}

class _Camera extends Mock implements AssistantLiveCameraService {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Socket extends Mock implements AssistantLiveSocketClient {}

/// A provider that accepts every socket, reports it ready, then drops it
/// after [uptime], like a flapping network. Each attempt costs a fresh token.
class _DroppingProvider {
  _DroppingProvider() {
    when(() => socket.events).thenAnswer((_) => events.stream);
    when(socket.disconnect).thenAnswer((_) async {});
    when(socket.endAudioStream).thenReturn(null);
    when(player.initialize).thenAnswer((_) async {});
    when(player.dispose).thenAnswer((_) async {});
    when(player.pause).thenAnswer((_) async {});
    when(player.clear).thenAnswer((_) async {});
    when(
      recorder.stop,
    ).thenAnswer((_) => heldRecorderStop?.future ?? Future<void>.value());
    when(
      () => repository.persistLiveTurn(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
        turnId: any(named: 'turnId'),
        model: any(named: 'model'),
        messages: any(named: 'messages'),
      ),
    ).thenAnswer((_) => heldPersistence?.future ?? Future<void>.value());
    when(recorder.dispose).thenAnswer((_) async {});
    when(camera.stopStreaming).thenAnswer((_) async {});
    when(camera.dispose).thenAnswer((_) async {});
    when(
      () => repository.fetchLiveToken(
        wsId: 'ws',
        chatId: any(named: 'chatId'),
        model: any(named: 'model'),
        forceFresh: any(named: 'forceFresh'),
      ),
    ).thenAnswer((invocation) async {
      tokens++;
      requestedModels.add(invocation.namedArguments[#model] as String?);
      return const AssistantLiveTokenEnvelope(
        token: 'synthetic-token',
        chatId: 'chat',
        scopeKey: 'scope',
        sessionHandle: null,
        model: 'model',
        seedHistory: [],
      );
    });
    when(
      () => socket.connect(
        token: any(named: 'token'),
        model: any(named: 'model'),
        seedHistory: any(named: 'seedHistory'),
        sessionHandle: any(named: 'sessionHandle'),
      ),
    ).thenAnswer((_) async {
      scheduleMicrotask(() => events.add(const AssistantLiveSocketReady()));
      unawaited(
        Future<void>.delayed(dropAfter, () {
          if (!dropping || events.isClosed) return;
          now = now.add(uptime);
          events.add(const AssistantLiveSocketClosed('provider dropped'));
        }),
      );
    });
    cubit = AssistantLiveCubit(
      repository: repository,
      socket: socket,
      audioPlayer: player,
      recorder: recorder,
      cameraService: camera,
      onChatBound: (_, _) => heldBinding?.future ?? Future<void>.value(),
      onHistoryUpdated: (_, _) async {},
      currentScopeToken: () => scope,
      now: () => now,
    );
  }

  final repository = _Repository();
  final player = _Player();
  final camera = _Camera();
  final recorder = _Recorder();
  final socket = _Socket();
  final events = StreamController<AssistantLiveSocketEvent>.broadcast();
  late final AssistantLiveCubit cubit;
  int tokens = 0;
  bool dropping = true;
  DateTime now = DateTime.utc(2026, 10, 25, 12);
  Duration uptime = const Duration(seconds: 10);
  Duration dropAfter = const Duration(seconds: 1);
  int scope = 0;
  Completer<void>? heldBinding;
  Completer<void>? heldPersistence;
  Completer<void>? heldRecorderStop;
  final requestedModels = <String?>[];

  /// Stops drops and releases binding so pending fixture timers drain.
  Future<void> settle(WidgetTester tester) async {
    dropping = false;
    for (final held in [heldBinding, heldPersistence, heldRecorderStop]) {
      if (held != null && !held.isCompleted) held.complete();
    }
    heldBinding = heldPersistence = heldRecorderStop = null;
    await _advance(tester, const Duration(seconds: 20));
  }

  Future<void> close() async {
    await cubit.close();
    await events.close();
  }
}

Future<void> _advance(WidgetTester tester, Duration total) async {
  const step = Duration(milliseconds: 200);
  for (var elapsed = Duration.zero; elapsed < total; elapsed += step) {
    await tester.pump(step);
  }
}

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
    final p = _DroppingProvider();
    addTearDown(p.close);
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await _advance(tester, const Duration(minutes: 3));
    // One user start plus the bounded automatic reconnects, then Retry.
    expect(p.tokens, 1 + assistantLiveMaxReconnectAttempts);
    expect(p.cubit.state.status, AssistantLiveConnectionStatus.error);
    expect(p.cubit.state.error, 'live_reconnect_exhausted');
    await _advance(tester, const Duration(minutes: 3));
    expect(p.tokens, 1 + assistantLiveMaxReconnectAttempts);
  });

  testWidgets('drops after a stable connection keep reconnecting', (
    tester,
  ) async {
    final p = _DroppingProvider()..uptime = const Duration(minutes: 10);
    addTearDown(p.close);
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await _advance(tester, const Duration(seconds: 30));
    // Routine provider GoAways after long healthy stretches never exhaust.
    expect(p.tokens, greaterThan(1 + assistantLiveMaxReconnectAttempts));
    expect(p.cubit.state.error, isNot('live_reconnect_exhausted'));
    p.dropping = false;
    await _advance(tester, const Duration(seconds: 5));
  });

  testWidgets('a user Retry after exhaustion gets a fresh budget', (
    tester,
  ) async {
    final p = _DroppingProvider();
    addTearDown(p.close);
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await _advance(tester, const Duration(minutes: 3));
    expect(p.tokens, 1 + assistantLiveMaxReconnectAttempts);
    unawaited(p.cubit.prepareSession(wsId: 'ws', reconnect: true));
    await _advance(tester, const Duration(minutes: 3));
    expect(p.tokens, 2 * (1 + assistantLiveMaxReconnectAttempts));
    expect(p.cubit.state.error, 'live_reconnect_exhausted');
  });

  testWidgets('a drop while the reconnect binds history still reconnects', (
    tester,
  ) async {
    final p = _DroppingProvider()..heldBinding = Completer<void>();
    addTearDown(p.close);
    // Every attempt connects, then drops while its history binding is held.
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await _advance(tester, const Duration(minutes: 3));
    expect(p.tokens, 1 + assistantLiveMaxReconnectAttempts);
    expect(p.cubit.state.error, 'live_reconnect_exhausted');
    await p.settle(tester);
  });

  for (final retirement in ['disconnect', 'scope change']) {
    testWidgets('a retired reconnect cannot swallow a new call drop after '
        '$retirement', (tester) async {
      final p = _DroppingProvider();
      addTearDown(p.close);
      unawaited(p.cubit.prepareSession(wsId: 'ws'));
      // The first call drops; its reconnect waits 0.8 s.
      await _advance(tester, const Duration(milliseconds: 1200));
      expect(p.tokens, 1);
      if (retirement == 'disconnect') {
        await p.cubit.disconnect();
      } else {
        p.scope++;
      }
      // A new call drops before the retired delay would have expired.
      p.dropAfter = const Duration(milliseconds: 100);
      unawaited(p.cubit.prepareSession(wsId: 'ws'));
      await _advance(tester, const Duration(seconds: 3));
      expect(p.tokens, greaterThan(2), reason: 'the new call reconnects');
      await p.settle(tester);
    });
  }

  testWidgets('closing Live retires a pending reconnect timer', (tester) async {
    final p = _DroppingProvider();
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await _advance(tester, const Duration(milliseconds: 1200));
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
    final p = _DroppingProvider()
      ..dropping = false
      ..heldPersistence = Completer<void>();
    addTearDown(p.close);
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await _advance(tester, const Duration(milliseconds: 400));
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
    await _advance(tester, const Duration(seconds: 2));
    p.heldPersistence!.complete();
    await _advance(tester, const Duration(seconds: 2));
    expect(p.requestedModels.skip(1), ['user-model']);
    expect(userResult, isNotNull, reason: 'the user start was superseded');
    expect(p.cubit.state.status, AssistantLiveConnectionStatus.connected);
    await p.settle(tester);
  });

  testWidgets('a drop during a slow End Call teardown never reconnects', (
    tester,
  ) async {
    final p = _DroppingProvider()..dropping = false;
    addTearDown(p.close);
    unawaited(p.cubit.prepareSession(wsId: 'ws'));
    await _advance(tester, const Duration(milliseconds: 400));
    expect(p.cubit.state.status, AssistantLiveConnectionStatus.connected);
    p.heldRecorderStop = Completer<void>();
    var ended = false;
    unawaited(
      p.cubit.disconnect(finishTurn: true).whenComplete(() => ended = true),
    );
    await tester.pump();
    // The provider drops while native teardown is still in progress.
    p.events.add(const AssistantLiveSocketClosed('provider dropped'));
    await _advance(tester, const Duration(seconds: 3));
    p.heldRecorderStop!.complete();
    await _advance(tester, const Duration(seconds: 3));
    expect(ended, isTrue);
    expect(p.tokens, 1, reason: 'End Call was superseded by a reconnect');
    expect(p.cubit.state.status, AssistantLiveConnectionStatus.disconnected);
    expect(p.cubit.state.hasEnded, isTrue);
    await p.settle(tester);
  });
}
