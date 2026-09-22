import 'dart:async';
import 'dart:typed_data';

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

Future<void> _tick() => Future<void>.delayed(const Duration(milliseconds: 10));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final cancel in [false, true]) {
    test('startup capture ${cancel ? "discards" : "flushes"} audio', () async {
      final repository = _Repository();
      final player = _Player();
      final camera = _Camera();
      final recorder = _Recorder();
      final socket = _Socket();
      final events = StreamController<AssistantLiveSocketEvent>();
      final token = Completer<AssistantLiveTokenEnvelope>();
      final sent = <List<int>>[];
      late void Function(Uint8List) capture;
      when(() => socket.events).thenAnswer((_) => events.stream);
      when(recorder.ensurePermission).thenAnswer((_) async => true);
      when(
        () => recorder.start(
          onData: any(named: 'onData'),
          onAmplitude: any(named: 'onAmplitude'),
          onError: any(named: 'onError'),
        ),
      ).thenAnswer((call) async {
        capture = call.namedArguments[#onData] as void Function(Uint8List);
      });
      when(recorder.stop).thenAnswer((_) async {});
      when(recorder.dispose).thenAnswer((_) async {});
      when(player.initialize).thenAnswer((_) async {});
      when(player.dispose).thenAnswer((_) async {});
      when(camera.stopStreaming).thenAnswer((_) async {});
      when(camera.dispose).thenAnswer((_) async {});
      when(socket.disconnect).thenAnswer((_) async {});
      when(
        () => repository.fetchLiveToken(
          wsId: 'ws',
          chatId: any(named: 'chatId'),
          forceFresh: any(named: 'forceFresh'),
          model: any(named: 'model'),
        ),
      ).thenAnswer((_) => token.future);
      when(
        () => socket.connect(
          token: 'token',
          model: 'model',
          seedHistory: const [],
          sessionHandle: any(named: 'sessionHandle'),
        ),
      ).thenAnswer((_) async {
        events.add(const AssistantLiveSocketReady());
      });
      when(() => socket.sendAudioChunk(any())).thenAnswer((call) {
        sent.add(List<int>.from(call.positionalArguments.single as Uint8List));
      });
      final cubit = AssistantLiveCubit(
        repository: repository,
        socket: socket,
        audioPlayer: player,
        recorder: recorder,
        cameraService: camera,
        onChatBound: (_, _) async {},
        onHistoryUpdated: (_, _) async {},
      );
      final connecting = cubit.prepareSession(wsId: 'ws');
      final recording = cubit.toggleMicrophone();
      await _tick();
      capture(Uint8List.fromList([1, 2]));
      capture(Uint8List.fromList([3, 4]));
      expect(sent, isEmpty);
      expect(cubit.state.isMicrophoneActive, isTrue);
      if (cancel) await cubit.toggleMicrophone();
      token.complete(
        const AssistantLiveTokenEnvelope(
          token: 'token',
          chatId: 'chat',
          scopeKey: 'scope',
          sessionHandle: null,
          model: 'model',
          seedHistory: [],
        ),
      );
      await Future.wait([connecting, recording]);
      await _tick();
      expect(
        sent,
        cancel
            ? isEmpty
            : [
                [1, 2],
                [3, 4],
              ],
      );
      if (!cancel) {
        when(
          () => repository.storeSessionHandle(
            wsId: 'ws',
            scopeKey: 'scope',
            sessionHandle: 'resume',
          ),
        ).thenThrow(Exception('Storage unavailable'));
        when(
          () => repository.clearSessionHandle(wsId: 'ws', scopeKey: 'scope'),
        ).thenThrow(Exception('Storage unavailable'));
        for (final resumable in [true, false]) {
          events.add(
            AssistantLiveSocketSessionHandleUpdated(
              resumable: resumable,
              newHandle: resumable ? 'resume' : null,
            ),
          );
          await _tick();
          expect(cubit.state.isMicrophoneActive, isTrue);
          expect(cubit.state.error, isNull);
        }
        verifyNever(recorder.stop);
      }
      if (cancel) {
        capture(Uint8List.fromList([5, 6]));
        await _tick();
        expect(sent, isEmpty);
      }
      await cubit.close();
      await events.close();
    });
  }
  setUpAll(() => registerFallbackValue(Uint8List(0)));
}
