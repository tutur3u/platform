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

import 'live_dispatch_transport.dart';

class _Repository extends Mock implements AssistantLiveRepository {}

class _Player extends Mock implements AssistantLiveAudioPlayer {}

class _Camera extends Mock implements AssistantLiveCameraService {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Socket extends Mock implements AssistantLiveSocketClient {}

Future<void> _tick() => Future<void>.delayed(Duration.zero);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AssistantLiveCubit cubit;
  late _Repository repository;
  late _Player player;
  late _Socket socket;
  late StreamController<AssistantLiveSocketEvent> events;
  late Completer<void> history;
  var historyStarted = false;
  var scopeToken = 0;

  setUp(() {
    repository = _Repository();
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
    when(player.pause).thenAnswer((_) async {});
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

  test(
    'cancelled delayed token cannot connect or mutate the new pending attempt',
    () async {
      final oldToken = Completer<AssistantLiveTokenEnvelope>();
      final nextToken = Completer<AssistantLiveTokenEnvelope>();
      var requests = 0;
      when(
        () => repository.fetchLiveToken(
          wsId: 'ws',
          chatId: any(named: 'chatId'),
          model: any(named: 'model'),
          forceFresh: any(named: 'forceFresh'),
        ),
      ).thenAnswer((_) => requests++ == 0 ? oldToken.future : nextToken.future);
      const envelope = AssistantLiveTokenEnvelope(
        token: 'token',
        chatId: 'chat',
        scopeKey: 'scope',
        sessionHandle: null,
        model: 'model',
        seedHistory: [],
      );
      final old = cubit.prepareSession(wsId: 'ws');
      await _tick();
      await cubit.disconnect();
      final next = cubit.prepareSession(wsId: 'ws');
      await _tick();
      oldToken.complete(envelope);
      await old;
      expect(cubit.state.status, AssistantLiveConnectionStatus.preparing);
      expect(cubit.state.startupTimings, isEmpty);
      expectNoConnection();
      nextToken.complete(envelope);
      history.complete();
      await next;
      expect(cubit.state.status, AssistantLiveConnectionStatus.connected);
      verify(
        () => socket.connect(
          token: 'token',
          model: 'model',
          seedHistory: const [],
          sessionHandle: any(named: 'sessionHandle'),
        ),
      ).called(1);
    },
  );

  test(
    'chat binding overlaps the provider handshake instead of gating it',
    () async {
      final audio = Completer<void>();
      when(player.initialize).thenAnswer((_) => audio.future);
      final preparing = cubit.prepareSession(wsId: 'ws');
      await _tick();
      expect(historyStarted, isTrue);
      verify(player.initialize).called(1);
      expectNoConnection();
      var settled = false;
      unawaited(preparing.then((_) => settled = true));
      audio.complete();
      for (var i = 0; i < 6; i++) {
        await _tick();
      }
      // Connected while the visible conversation is still binding, but the
      // caller (a typed send) is held until binding settles.
      expect(cubit.state.status, AssistantLiveConnectionStatus.connected);
      verify(
        () => socket.connect(
          token: 'token',
          model: 'model',
          seedHistory: const [],
          sessionHandle: any(named: 'sessionHandle'),
        ),
      ).called(1);
      expect(settled, isFalse);
      history.complete();
      expect(await preparing, isNotNull);
      expect(
        cubit.state.startupTimings.keys.toSet(),
        AssistantLiveStartupPhase.values.toSet(),
      );
      expect(cubit.state.startupTimings.values, everyElement(isNonNegative));
    },
  );

  test('chat binding failure never fails a connected call', () async {
    final preparing = cubit.prepareSession(wsId: 'ws');
    await _tick();
    history.completeError(Exception('History unavailable'));
    await preparing;
    await _tick();
    expect(cubit.state.status, AssistantLiveConnectionStatus.connected);
    expect(
      cubit.state.startupTimings,
      contains(AssistantLiveStartupPhase.history),
    );
  });

  test('failed audio setup settles without connecting', () async {
    final audio = Completer<void>();
    when(player.initialize).thenAnswer((_) => audio.future);
    final preparing = cubit.prepareSession(wsId: 'ws');
    await _tick();
    audio.completeError(Exception('Audio unavailable'));
    await preparing;
    expectNoConnection();
    expect(cubit.state.status, AssistantLiveConnectionStatus.error);
    expect(
      cubit.state.startupTimings.keys,
      containsAll([
        AssistantLiveStartupPhase.audio,
        AssistantLiveStartupPhase.total,
      ]),
    );
    expect(
      cubit.state.startupTimings,
      isNot(contains(AssistantLiveStartupPhase.socket)),
    );
    history.complete();
    await _tick();
    expect(cubit.state.status, AssistantLiveConnectionStatus.error);
  });

  test(
    'obsolete scope cannot connect or publish startup measurements',
    () async {
      final audio = Completer<void>();
      when(player.initialize).thenAnswer((_) => audio.future);
      final preparing = cubit.prepareSession(wsId: 'ws');
      await _tick();
      scopeToken++;
      audio.complete();
      history.complete();
      await preparing;
      await _tick();
      expectNoConnection();
      expect(cubit.state.startupTimings, isEmpty);
    },
  );

  test(
    'scope change while binding retires the connected provider socket',
    () async {
      final preparing = cubit.prepareSession(wsId: 'ws');
      for (var i = 0; i < 6; i++) {
        await _tick();
      }
      expect(cubit.state.status, AssistantLiveConnectionStatus.connected);
      verifyNever(socket.disconnect);
      scopeToken++;
      history.complete();
      expect(await preparing, isNull);
      verify(socket.disconnect).called(1);
      expect(cubit.state.status, AssistantLiveConnectionStatus.disconnected);
    },
  );

  for (final change in ['actor', 'workspace scope']) {
    test('$change change while binding closes the opened wire', () async {
      final wire = LiveDispatchTransport()..autoReady = true;
      final binding = Completer<void>();
      final recorder = _Recorder();
      final camera = _Camera();
      when(recorder.stop).thenAnswer((_) async {});
      when(recorder.dispose).thenAnswer((_) async {});
      when(camera.stopStreaming).thenAnswer((_) async {});
      when(camera.dispose).thenAnswer((_) async {});
      var actor = 'user';
      var scope = 0;
      final live = AssistantLiveCubit(
        repository: repository,
        socket: wire.socket,
        audioPlayer: player,
        recorder: recorder,
        cameraService: camera,
        currentUserId: () => actor,
        currentScopeToken: () => scope,
        onChatBound: (_, _) => binding.future,
        onHistoryUpdated: (_, _) async {},
      );
      addTearDown(() async {
        await live.close();
        await wire.dispose();
      });
      final preparing = live.prepareSession(wsId: 'ws');
      for (var i = 0; i < 8; i++) {
        await _tick();
      }
      expect(live.state.status, AssistantLiveConnectionStatus.connected);
      expect(wire.setups, 1);
      expect(wire.sinkCloses, 0);
      if (change == 'actor') {
        actor = 'other-user';
      } else {
        scope++;
      }
      binding.complete();
      expect(await preparing, isNull);
      expect(wire.sinkCloses, 1);
      expect(wire.setups, 1);
      expect(wire.textAttempts, 0);
      expect(live.state.status, AssistantLiveConnectionStatus.disconnected);
    });
  }

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
