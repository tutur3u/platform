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
  late _Socket socket;
  String? actor;
  var scopeToken = 0;
  var historyUpdates = 0;

  setUp(() async {
    repository = _Repository();
    final player = _Player();
    final camera = _Camera();
    final recorder = _Recorder();
    socket = _Socket();
    actor = null;
    scopeToken = 0;
    events = StreamController<AssistantLiveSocketEvent>();
    historyUpdates = 0;
    when(() => socket.events).thenAnswer((_) => events.stream);
    when(recorder.stop).thenAnswer((_) async {});
    when(recorder.dispose).thenAnswer((_) async {});
    when(player.initialize).thenAnswer((_) async {});
    when(player.clear).thenAnswer((_) async {});
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
      currentUserId: () => actor,
      currentScopeToken: () => scopeToken,
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

  test(
    'completion waits for tool results and saves interleaved parts',
    () async {
      final running = Completer<Map<String, dynamic>>();
      when(
        () => repository.executeToolCall(
          wsId: 'ws',
          functionName: 'search_tasks',
          args: any(named: 'args'),
        ),
      ).thenAnswer((_) => running.future);
      await cubit.sendTypedMessage(
        wsId: 'ws',
        text: 'Question',
        attachments: [],
      );
      events
        ..add(const AssistantLiveSocketTextDelta('Before'))
        ..add(
          const AssistantLiveSocketToolCall([
            AssistantLiveFunctionCall(
              id: 'one',
              name: 'search_tasks',
              args: {},
            ),
          ]),
        )
        ..add(const AssistantLiveSocketTextDelta('After'));
      await _tick();
      events.add(const AssistantLiveSocketTurnCompleted());
      await _tick();
      verifyNever(
        () => repository.persistLiveTurn(
          wsId: 'ws',
          chatId: 'chat',
          turnId: any(named: 'turnId'),
          model: 'model',
          messages: any(named: 'messages'),
        ),
      );
      running.complete({'summary': 'Found'});
      await _tick();
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
      final metadata = messages.last['metadata'] as Map<String, dynamic>;
      final parts = metadata['parts'] as List<Map<String, dynamic>>;
      expect(parts.map((p) => p['type']), ['text', 'dynamic-tool', 'text']);
      expect(parts[1]['output'], {'summary': 'Found'});
      expect(historyUpdates, 1);
    },
  );

  test(
    'replacement session drops old tool output and remaining writes',
    () async {
      final running = Completer<Map<String, dynamic>>();
      when(
        () => repository.executeToolCall(
          wsId: 'ws',
          functionName: 'first',
          args: any(named: 'args'),
        ),
      ).thenAnswer((_) => running.future);
      events.add(
        const AssistantLiveSocketToolCall([
          AssistantLiveFunctionCall(id: 'one', name: 'first', args: {}),
          AssistantLiveFunctionCall(id: 'two', name: 'second', args: {}),
        ]),
      );
      await _tick();
      await cubit.disconnect();
      await cubit.prepareSession(wsId: 'ws');
      running.complete({'summary': 'Old actor data'});
      await _tick();
      verifyNever(() => socket.sendToolResponses(any()));
      verifyNever(
        () => repository.executeToolCall(
          wsId: 'ws',
          functionName: 'second',
          args: any(named: 'args'),
        ),
      );
      expect(cubit.state.insightCards, isEmpty);
    },
  );

  test(
    'actor change drops pending output before the next tool executes',
    () async {
      final running = Completer<Map<String, dynamic>>();
      when(
        () => repository.executeToolCall(
          wsId: 'ws',
          functionName: 'first',
          args: any(named: 'args'),
        ),
      ).thenAnswer((_) => running.future);
      events.add(
        const AssistantLiveSocketToolCall([
          AssistantLiveFunctionCall(id: 'one', name: 'first', args: {}),
          AssistantLiveFunctionCall(id: 'two', name: 'second', args: {}),
        ]),
      );
      await _tick();
      actor = 'replacement';
      running.complete({'summary': 'Private previous result'});
      await _tick();
      verifyNever(() => socket.sendToolResponses(any()));
      verifyNever(
        () => repository.executeToolCall(
          wsId: 'ws',
          functionName: 'second',
          args: any(named: 'args'),
        ),
      );
      expect(cubit.state.insightCards, isEmpty);
    },
  );

  test(
    'new typed turn does not replace metadata of a pending old turn',
    () async {
      final running = Completer<Map<String, dynamic>>();
      when(
        () => repository.executeToolCall(
          wsId: 'ws',
          functionName: 'first',
          args: any(named: 'args'),
        ),
      ).thenAnswer((_) => running.future);
      await cubit.sendTypedMessage(wsId: 'ws', text: 'First', attachments: []);
      events.add(
        const AssistantLiveSocketToolCall([
          AssistantLiveFunctionCall(id: 'one', name: 'first', args: {}),
        ]),
      );
      await _tick();
      events.add(const AssistantLiveSocketTurnCompleted());
      await _tick();
      await cubit.sendTypedMessage(wsId: 'ws', text: 'Second', attachments: []);
      running.complete({'ok': true});
      await _tick();
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
      expect(messages.first['content'], 'First');
      expect((messages.first['metadata'] as Map)['inputText'], 'First');
      expect(cubit.state.userDraft, 'Second');
      verifyNever(() => socket.sendToolResponses(any()));
    },
  );
  test(
    'same actor with a replacement scope cannot publish pending output',
    () async {
      final running = Completer<Map<String, dynamic>>();
      when(
        () => repository.executeToolCall(
          wsId: 'ws',
          functionName: 'first',
          args: any(named: 'args'),
        ),
      ).thenAnswer((_) => running.future);
      events.add(
        const AssistantLiveSocketToolCall([
          AssistantLiveFunctionCall(id: 'one', name: 'first', args: {}),
        ]),
      );
      await _tick();
      scopeToken++;
      running.complete({'summary': 'Previous authenticated session'});
      await _tick();
      verifyNever(() => socket.sendToolResponses(any()));
      expect(cubit.state.insightCards, isEmpty);
    },
  );
}
