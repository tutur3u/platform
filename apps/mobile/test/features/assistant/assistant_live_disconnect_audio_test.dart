import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements AssistantLiveRepository {}

class _Api extends Mock implements ApiClient {}

class _Socket extends Mock implements AssistantLiveSocketClient {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Camera extends Mock implements AssistantLiveCameraService {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Future<
    ({AssistantLiveCubit cubit, _Api api, _Socket socket, List<String> cleanup})
  >
  fixture() async {
    const channel = MethodChannel('flutter_pcm_sound/methods');
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    final cleanup = <String>[];
    messenger.setMockMethodCallHandler(channel, (call) async {
      cleanup.add('pcm:${call.method}');
      return true;
    });
    addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
    final api = _Api();
    final socket = _Socket();
    final recorder = _Recorder();
    final camera = _Camera();
    final events = StreamController<AssistantLiveSocketEvent>();
    when(() => socket.events).thenAnswer((_) => events.stream);
    when(socket.disconnect).thenAnswer((_) async => cleanup.add('socket'));
    when(recorder.stop).thenAnswer((_) async => cleanup.add('recorder'));
    when(recorder.dispose).thenAnswer((_) async {});
    when(camera.stopStreaming).thenAnswer((_) async => cleanup.add('camera'));
    when(camera.dispose).thenAnswer((_) async {});
    final player = AssistantLiveAudioPlayer();
    final cubit = AssistantLiveCubit(
      repository: AssistantLiveRepository(apiClient: api),
      socket: socket,
      audioPlayer: player,
      recorder: recorder,
      cameraService: camera,
      currentUserId: () => null,
      onChatBound: (_, _) async {},
      onHistoryUpdated: (_, _) async {},
    );
    addTearDown(() async {
      await cubit.close();
      await events.close();
    });
    await player.initialize();
    cubit.emit(
      const AssistantLiveState(
        workspaceId: 'ws',
        chatId: 'chat',
        scopeKey: 'scope',
        sessionHandle: 'synthetic-handle',
        status: AssistantLiveConnectionStatus.connected,
        userDraft: 'Synthetic draft',
        assistantDraft: 'Synthetic reply',
        isMicrophoneActive: true,
        isCameraActive: true,
        audioLevel: .5,
        assistantAudioLevel: .5,
        isAssistantSpeaking: true,
      ),
    );
    return (cubit: cubit, api: api, socket: socket, cleanup: cleanup);
  }

  void expectTeardown(AssistantLiveCubit cubit, List<String> cleanup) {
    expect(cleanup.where((step) => step == 'socket'), hasLength(1));
    expect(cleanup.where((step) => step == 'recorder'), hasLength(1));
    expect(cleanup.where((step) => step == 'camera'), hasLength(1));
    expect(cleanup.where((step) => step == 'pcm:release'), hasLength(1));
    expect(cubit.state.status, AssistantLiveConnectionStatus.disconnected);
    expect(cubit.state.userDraft, isEmpty);
    expect(cubit.state.assistantDraft, isEmpty);
    expect(cubit.state.isMicrophoneActive, false);
    expect(cubit.state.isCameraActive, false);
    expect(cubit.state.isAssistantSpeaking, false);
    expect(cubit.state.audioLevel, 0);
    expect(cubit.state.assistantAudioLevel, 0);
  }

  for (final report in [false, true]) {
    test(
      'actual repository cleanup failure report=$report follows teardown',
      () async {
        final f = await fixture();
        var attempts = 0;
        when(() => f.api.deleteJson(any())).thenAnswer((_) async {
          attempts++;
          expect(
            f.cleanup,
            containsAll(['socket', 'recorder', 'camera', 'pcm:release']),
          );
          throw const ApiException(
            message: 'Synthetic provider diagnostic',
            statusCode: 503,
          );
        });
        final work = report
            ? f.cubit.disconnect(
                clearSession: true,
                reportSessionCleanupFailure: true,
              )
            : f.cubit.disconnect(clearSession: true);
        if (report) {
          await expectLater(
            work,
            throwsA(
              isA<AssistantLiveSessionCleanupException>().having(
                (error) => error.toString(),
                'fixed message',
                'Assistant live session cleanup failed.',
              ),
            ),
          );
        } else {
          await work;
        }
        expect(attempts, 1);
        verify(
          () => f.api.deleteJson('/api/v1/live/session?wsId=ws&scopeKey=scope'),
        ).called(1);
        expectTeardown(f.cubit, f.cleanup);
        expect(f.cubit.state.sessionHandle, null);
        expect(f.cubit.state.error, null);
        verifyNever(() => f.api.postJson(any(), any()));
      },
    );
  }

  test(
    'opt-in successful cleanup makes one delete after audio release',
    () async {
      final f = await fixture();
      when(() => f.api.deleteJson(any())).thenAnswer((_) async => {});
      await f.cubit.disconnect(
        clearSession: true,
        reportSessionCleanupFailure: true,
      );
      expectTeardown(f.cubit, f.cleanup);
      expect(f.cubit.state.sessionHandle, null);
      verify(
        () => f.api.deleteJson('/api/v1/live/session?wsId=ws&scopeKey=scope'),
      ).called(1);
      verifyNever(() => f.api.postJson(any(), any()));
    },
  );

  test(
    'report without clear preserves handle and never calls repository',
    () async {
      final f = await fixture();
      await f.cubit.disconnect(reportSessionCleanupFailure: true);
      expectTeardown(f.cubit, f.cleanup);
      expect(f.cubit.state.sessionHandle, 'synthetic-handle');
      verifyNever(() => f.api.deleteJson(any()));
      verifyNever(() => f.api.postJson(any(), any()));
    },
  );

  test(
    'opt-in preserves transport failure without a cleanup attempt',
    () async {
      final f = await fixture();
      final error = StateError('Synthetic transport failure');
      when(f.socket.disconnect).thenAnswer((_) async => throw error);
      await expectLater(
        f.cubit.disconnect(
          clearSession: true,
          reportSessionCleanupFailure: true,
        ),
        throwsA(same(error)),
      );
      expect(f.cubit.state.sessionHandle, 'synthetic-handle');
      verifyNever(() => f.api.deleteJson(any()));
      // Disposal has its existing separate attempt and must be drainable.
      when(f.socket.disconnect).thenAnswer((_) async {});
    },
  );

  test('opt-in preserves non-Exception repository error propagation', () async {
    final f = await fixture();
    final error = StateError('Synthetic repository error');
    when(() => f.api.deleteJson(any())).thenAnswer((_) async => throw error);
    await expectLater(
      f.cubit.disconnect(clearSession: true, reportSessionCleanupFailure: true),
      throwsA(same(error)),
    );
    expect(f.cubit.state.userDraft, 'Synthetic draft');
    expect(f.cubit.state.sessionHandle, 'synthetic-handle');
    expect(f.cleanup, contains('pcm:release'));
    verify(() => f.api.deleteJson(any())).called(1);
  });

  test(
    'successful cleanup supersession retains existing early return',
    () async {
      final f = await fixture();
      final entered = Completer<void>();
      final release = Completer<void>();
      when(() => f.api.deleteJson(any())).thenAnswer((_) async {
        entered.complete();
        await release.future;
        return {};
      });
      final earlier = f.cubit.disconnect(
        clearSession: true,
        reportSessionCleanupFailure: true,
      );
      await entered.future;
      await f.cubit.disconnect();
      release.complete();
      await earlier;
      expect(f.cubit.state.sessionHandle, 'synthetic-handle');
      expect(f.cubit.state.status, AssistantLiveConnectionStatus.disconnected);
      verify(() => f.api.deleteJson(any())).called(1);
      verifyNever(() => f.api.postJson(any(), any()));
    },
  );

  test('disconnect releases real playback; '
      'late audio is fenced and next call plays', () async {
    const channel = MethodChannel('flutter_pcm_sound/methods');
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    final calls = <String>[];
    messenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call.method);
      return true;
    });
    addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
    final repository = _Repository();
    final socket = _Socket();
    final recorder = _Recorder();
    final camera = _Camera();
    final events = StreamController<AssistantLiveSocketEvent>();
    when(() => socket.events).thenAnswer((_) => events.stream);
    when(socket.disconnect).thenAnswer((_) async {});
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
        token: 'synthetic',
        chatId: 'chat',
        scopeKey: 'scope',
        sessionHandle: null,
        model: 'model',
        seedHistory: [],
      ),
    );
    when(
      () => socket.connect(
        token: 'synthetic',
        model: 'model',
        seedHistory: const [],
        sessionHandle: any(named: 'sessionHandle'),
      ),
    ).thenAnswer((_) async {
      events.add(const AssistantLiveSocketReady());
    });
    final cubit = AssistantLiveCubit(
      repository: repository,
      socket: socket,
      audioPlayer: AssistantLiveAudioPlayer(),
      recorder: recorder,
      cameraService: camera,
      currentUserId: () => 'actor',
      onChatBound: (_, _) async {},
      onHistoryUpdated: (_, _) async {},
    );
    addTearDown(() async {
      await cubit.close();
      await events.close();
    });
    await cubit.prepareSession(wsId: 'ws');
    expect(cubit.state.status, AssistantLiveConnectionStatus.connected);
    events.add(AssistantLiveSocketAudioChunk(Uint8List.fromList([1, 0])));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(calls.where((method) => method == 'feed'), hasLength(1));
    await cubit.disconnect();
    final disconnectedCalls = List<String>.of(calls);
    expect(calls.last, 'release');
    expect(calls.where((method) => method == 'setup'), hasLength(1));
    events.add(AssistantLiveSocketAudioChunk(Uint8List.fromList([2, 0])));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(calls, disconnectedCalls);
    await cubit.prepareSession(wsId: 'ws');
    events.add(AssistantLiveSocketAudioChunk(Uint8List.fromList([3, 0])));
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(calls.where((method) => method == 'setup'), hasLength(2));
    expect(calls.where((method) => method == 'feed'), hasLength(2));
  });
}
