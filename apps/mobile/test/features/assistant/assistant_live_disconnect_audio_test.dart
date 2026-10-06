import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/services.dart';
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

class _Socket extends Mock implements AssistantLiveSocketClient {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Camera extends Mock implements AssistantLiveCameraService {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'disconnect releases real playback; late audio is fenced and next call plays',
    () async {
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
    },
  );
}
