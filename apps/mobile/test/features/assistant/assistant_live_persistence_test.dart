import 'dart:async';

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

class _Player extends Mock implements AssistantLiveAudioPlayer {}

class _Camera extends Mock implements AssistantLiveCameraService {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Socket extends Mock implements AssistantLiveSocketClient {}

Future<void> _tick() => Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Repository repository;
  late StreamController<AssistantLiveSocketEvent> events;
  late AssistantLiveCubit cubit;
  var historyUpdates = 0;

  setUp(() async {
    repository = _Repository();
    final player = _Player();
    final camera = _Camera();
    final recorder = _Recorder();
    final socket = _Socket();
    events = StreamController<AssistantLiveSocketEvent>();
    historyUpdates = 0;
    when(() => socket.events).thenAnswer((_) => events.stream);
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
    cubit = AssistantLiveCubit(
      repository: repository,
      socket: socket,
      audioPlayer: player,
      recorder: recorder,
      cameraService: camera,
      onChatBound: (_, _) async {},
      onHistoryUpdated: (_, _) async {
        historyUpdates++;
      },
    );
    await cubit.prepareSession(wsId: 'ws');
  });

  tearDown(() async {
    await cubit.close();
    await events.close();
  });

  test('failed persistence retains both sides of the visible turn', () async {
    when(
      () => repository.persistLiveTurn(
        wsId: 'ws',
        chatId: 'chat',
        turnId: any(named: 'turnId'),
        model: 'model',
        messages: any(named: 'messages'),
      ),
    ).thenThrow(const ApiException(message: 'Unavailable', statusCode: 503));
    await cubit.sendTypedMessage(
      wsId: 'ws',
      text: 'Keep this question',
      attachments: [],
    );
    events.add(const AssistantLiveSocketTextDelta('Keep this answer'));
    await _tick();
    events.add(const AssistantLiveSocketTurnCompleted());
    await _tick();
    expect(cubit.state.status, AssistantLiveConnectionStatus.error);
    expect(cubit.state.userDraft, 'Keep this question');
    expect(cubit.state.assistantDraft, 'Keep this answer');
    expect(historyUpdates, 0);
  });

  test('finishing an older save cannot clear the next active turn', () async {
    final saving = Completer<void>();
    when(
      () => repository.persistLiveTurn(
        wsId: 'ws',
        chatId: 'chat',
        turnId: any(named: 'turnId'),
        model: 'model',
        messages: any(named: 'messages'),
      ),
    ).thenAnswer((_) => saving.future);
    await cubit.sendTypedMessage(wsId: 'ws', text: 'First', attachments: []);
    events.add(const AssistantLiveSocketTextDelta('First answer'));
    await _tick();
    events.add(const AssistantLiveSocketTurnCompleted());
    await _tick();
    await cubit.sendTypedMessage(wsId: 'ws', text: 'Second', attachments: []);
    events.add(const AssistantLiveSocketTextDelta('Second answer'));
    await _tick();
    saving.complete();
    await _tick();
    expect(cubit.state.userDraft, 'Second');
    expect(cubit.state.assistantDraft, 'Second answer');
    expect(historyUpdates, 1);
  });
}
