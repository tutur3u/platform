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
class LiveDroppingProvider {
  LiveDroppingProvider() {
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
      final requested = invocation.namedArguments[#model] as String?;
      requestedModels.add(requested);
      tokenSteps.add((step: step, model: requested));
      return AssistantLiveTokenEnvelope(
        token: 'synthetic-token',
        chatId: 'chat',
        scopeKey: 'scope',
        sessionHandle: null,
        model: requested ?? 'model',
        seedHistory: const [],
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
      connectSteps.add(step);
      scheduleMicrotask(() {
        if (!events.isClosed) events.add(const AssistantLiveSocketReady());
      });
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

  /// The scenario step during which each token fetch and socket connect ran.
  int step = 0;
  final tokenSteps = <({int step, String? model})>[];
  final connectSteps = <int>[];

  /// Stops drops and releases binding so pending fixture timers drain.
  Future<void> settle(WidgetTester tester) async {
    dropping = false;
    for (final held in [heldBinding, heldPersistence, heldRecorderStop]) {
      if (held != null && !held.isCompleted) held.complete();
    }
    heldBinding = heldPersistence = heldRecorderStop = null;
    await advanceLive(tester, const Duration(seconds: 20));
  }

  Future<void> close() async {
    await cubit.close();
    await events.close();
  }
}

/// Advances fake time in small steps so timers and microtasks interleave.
Future<void> advanceLive(WidgetTester tester, Duration total) async {
  const step = Duration(milliseconds: 200);
  for (var elapsed = Duration.zero; elapsed < total; elapsed += step) {
    await tester.pump(step);
  }
}
