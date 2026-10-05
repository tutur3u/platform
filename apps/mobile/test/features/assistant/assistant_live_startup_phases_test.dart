import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_startup_timings.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements AssistantLiveRepository {}

class _Player extends Mock implements AssistantLiveAudioPlayer {}

class _Camera extends Mock implements AssistantLiveCameraService {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Socket extends Mock implements AssistantLiveSocketClient {}

Future<void> _tick() => Future<void>.delayed(Duration.zero);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AssistantLiveCubit cubit;
  late _Player player;
  late _Socket socket;
  late StreamController<AssistantLiveSocketEvent> events;
  late Completer<void> history;
  var historyStarted = false;
  var scopeToken = 0;

  setUp(() {
    final repository = _Repository();
    player = _Player();
    socket = _Socket();
    final camera = _Camera();
    final recorder = _Recorder();
    events = StreamController<AssistantLiveSocketEvent>();
    history = Completer<void>();
    historyStarted = false;
    scopeToken = 0;
    when(() => socket.events).thenAnswer((_) => events.stream);
    when(socket.disconnect).thenAnswer((_) async {});
    when(player.initialize).thenAnswer((_) async {});
    when(player.dispose).thenAnswer((_) async {});
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
    ).thenAnswer(
      (_) async => const AssistantLiveTokenEnvelope(
        token: 'token',
        chatId: 'chat',
        scopeKey: 'scope',
        sessionHandle: null,
        model: 'model',
        seedHistory: [],
      ),
    );
    when(
      () => socket.connect(
        token: 'token',
        model: 'model',
        seedHistory: const [],
        sessionHandle: any(named: 'sessionHandle'),
      ),
    ).thenAnswer((_) async => events.add(const AssistantLiveSocketReady()));
    cubit = AssistantLiveCubit(
      repository: repository,
      socket: socket,
      audioPlayer: player,
      recorder: recorder,
      cameraService: camera,
      currentScopeToken: () => scopeToken,
      onChatBound: (_, _) {
        historyStarted = true;
        return history.future;
      },
      onHistoryUpdated: (_, _) async {},
    );
  });
  tearDown(() async {
    await cubit.close();
    await events.close();
  });
  void expectNoConnection() => verifyNever(
    () => socket.connect(
      token: 'token',
      model: 'model',
      seedHistory: const [],
      sessionHandle: any(named: 'sessionHandle'),
    ),
  );

  test('history and audio start together but socket waits for both', () async {
    final audio = Completer<void>();
    when(player.initialize).thenAnswer((_) => audio.future);
    final preparing = cubit.prepareSession(wsId: 'ws');
    await _tick();
    expect(historyStarted, isTrue);
    verify(player.initialize).called(1);
    expectNoConnection();
    history.complete();
    await _tick();
    expectNoConnection();
    audio.complete();
    await preparing;
    expect(cubit.state.status, AssistantLiveConnectionStatus.connected);
    expect(
      cubit.state.startupTimings.keys.toSet(),
      AssistantLiveStartupPhase.values.toSet(),
    );
    expect(cubit.state.startupTimings.values, everyElement(isNonNegative));
  });

  test(
    'failed startup settles parallel native work without connecting',
    () async {
      final audio = Completer<void>();
      when(player.initialize).thenAnswer((_) => audio.future);
      var completed = false;
      final preparing = cubit.prepareSession(wsId: 'ws').then((_) {
        completed = true;
      });
      await _tick();
      history.completeError(Exception('History unavailable'));
      await _tick();
      expect(completed, isFalse);
      expectNoConnection();
      audio.complete();
      await preparing;
      expect(cubit.state.status, AssistantLiveConnectionStatus.error);
      expect(
        cubit.state.startupTimings.keys,
        containsAll([
          AssistantLiveStartupPhase.history,
          AssistantLiveStartupPhase.audio,
          AssistantLiveStartupPhase.total,
        ]),
      );
      expect(
        cubit.state.startupTimings,
        isNot(contains(AssistantLiveStartupPhase.socket)),
      );
    },
  );

  test(
    'obsolete scope cannot connect or publish startup measurements',
    () async {
      final preparing = cubit.prepareSession(wsId: 'ws');
      await _tick();
      scopeToken++;
      history.complete();
      await preparing;
      expectNoConnection();
      expect(cubit.state.startupTimings, isEmpty);
    },
  );

  test(
    'duration snapshots are immutable and contain only completed stages',
    () async {
      final timings = AssistantLiveStartupTimings();
      final value = await timings.measure(
        AssistantLiveStartupPhase.token,
        () async => 'result',
      );
      final snapshot = timings.snapshot;
      expect(value, 'result');
      expect(snapshot.keys, [AssistantLiveStartupPhase.token]);
      timings.finish();
      expect(snapshot, isNot(contains(AssistantLiveStartupPhase.total)));
      expect(
        () => snapshot[AssistantLiveStartupPhase.total] = 1,
        throwsUnsupportedError,
      );
    },
  );
}
