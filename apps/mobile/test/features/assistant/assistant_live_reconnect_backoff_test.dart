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
    when(recorder.stop).thenAnswer((_) async {});
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
    ).thenAnswer((_) async {
      tokens++;
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
        Future<void>.delayed(const Duration(seconds: 1), () {
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
      onChatBound: (_, _) async {},
      onHistoryUpdated: (_, _) async {},
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
}
