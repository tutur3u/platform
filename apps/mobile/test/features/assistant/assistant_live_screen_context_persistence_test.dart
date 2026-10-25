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

Future<void> _tick() => Future<void>.delayed(const Duration(milliseconds: 20));

const Map<String, dynamic> _screen = {
  'screen': 'calendar',
  'form': {
    'fields': [
      {'key': 'title', 'value': 'Private dentist visit'},
    ],
  },
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('screen context reaches the model but is never persisted', () async {
    final repository = _Repository();
    final socket = _Socket();
    final player = _Player();
    final camera = _Camera();
    final recorder = _Recorder();
    final events = StreamController<AssistantLiveSocketEvent>();
    when(() => socket.events).thenAnswer((_) => events.stream);
    when(recorder.stop).thenAnswer((_) async {});
    when(recorder.dispose).thenAnswer((_) async {});
    when(player.initialize).thenAnswer((_) async {});
    when(player.clear).thenAnswer((_) async {});
    when(player.pause).thenAnswer((_) async {});
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
    when(
      () => repository.persistLiveTurn(
        wsId: 'ws',
        chatId: 'chat',
        turnId: any(named: 'turnId'),
        model: 'model',
        messages: any(named: 'messages'),
      ),
    ).thenAnswer((_) async {});

    final cubit = AssistantLiveCubit(
      currentUserId: () => null,
      currentScopeToken: () => 0,
      repository: repository,
      socket: socket,
      audioPlayer: player,
      recorder: recorder,
      cameraService: camera,
      isTurnRestored: (_, _, _, _) => true,
      onChatBound: (_, _) async {},
      onHistoryUpdated: (_, _) async {},
      screenContextProvider: () => _screen,
    );
    addTearDown(() async {
      if (!cubit.isClosed) await cubit.close();
      await events.close();
    });
    await cubit.prepareSession(wsId: 'ws');
    await cubit.sendTypedMessage(
      wsId: 'ws',
      text: 'What am I editing?',
      attachments: [],
    );
    events.add(
      const AssistantLiveSocketToolCall([
        AssistantLiveFunctionCall(
          id: 'screen-1',
          name: 'get_mobile_screen_context',
          args: {},
        ),
      ]),
    );
    await _tick();
    events
      ..add(const AssistantLiveSocketTextDelta('A dentist visit.'))
      ..add(const AssistantLiveSocketTurnCompleted());
    await _tick();

    final responses =
        verify(() => socket.sendToolResponses(captureAny())).captured.single
            as List<Map<String, dynamic>>;
    expect(responses.single['response'], {'result': _screen});

    final messages =
        verify(
              () => repository.persistLiveTurn(
                wsId: 'ws',
                chatId: 'chat',
                turnId: any(named: 'turnId'),
                model: 'model',
                messages: captureAny(named: 'messages'),
              ),
            ).captured.single
            as List<Map<String, dynamic>>;
    final serialized = messages.toString();
    expect(serialized, isNot(contains('Private dentist visit')));
    expect(serialized, contains('get_mobile_screen_context'));
    expect(cubit.state.toString(), isNot(contains('Private dentist visit')));
  });
}
