import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/features/assistant/bridge/assistant_client_actions.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_dispatch.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements AssistantLiveRepository {}

class _Player extends Mock implements AssistantLiveAudioPlayer {}

class _Camera extends Mock implements AssistantLiveCameraService {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Socket extends Mock implements AssistantLiveSocketClient {}

class _File extends Mock implements File {}

const _image = AssistantAttachment(
  id: 'image',
  name: 'image.png',
  size: 1,
  type: 'image/png',
  localPath: 'synthetic/image.png',
  storagePath: 'uploaded/image.png',
  uploadState: AssistantAttachmentUploadState.uploaded,
);

/// Records only effects whose guard still holds when the effect would run.
class _Bridge implements AssistantClientActionBridge {
  final effects = <String>[];

  @override
  Set<String> get capabilities => const {'theme', 'navigate'};

  @override
  Future<AssistantClientActionResult> apply(
    String toolName,
    Map<String, dynamic> output, {
    bool Function()? isCurrent,
  }) async {
    if (!(isCurrent?.call() ?? true)) {
      return const AssistantClientActionResult.rejected('stale');
    }
    effects.add(toolName);
    return const AssistantClientActionResult.applied();
  }
}

Future<void> _tick() => Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  registerFallbackValue(Uint8List(0));

  late _Repository repository;
  late _Socket socket;
  late StreamController<AssistantLiveSocketEvent> events;
  late AssistantLiveCubit cubit;
  late _Bridge bridge;
  late Completer<Map<String, dynamic>> toolResult;
  late AssistantLiveSinkAdmission admission;

  setUp(() async {
    repository = _Repository();
    socket = _Socket();
    final player = _Player();
    final camera = _Camera();
    final recorder = _Recorder();
    events = StreamController<AssistantLiveSocketEvent>();
    toolResult = Completer<Map<String, dynamic>>();
    admission = AssistantLiveSinkAdmission.admitted;
    bridge = _Bridge();
    final unregister = AssistantClientActions.register(bridge);
    addTearDown(unregister);
    when(() => socket.events).thenAnswer((_) => events.stream);
    when(() => socket.sendText(any())).thenAnswer((_) => admission);
    when(
      () => socket.sendVideoFrame(any()),
    ).thenReturn(AssistantLiveSinkAdmission.admitted);
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
      () => repository.executeToolCall(
        wsId: 'ws',
        functionName: 'execute_workspace_tool',
        args: any(named: 'args'),
        toolProtocol: any(named: 'toolProtocol'),
        toolCallId: any(named: 'toolCallId'),
      ),
    ).thenAnswer((_) => toolResult.future);
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
    );
    addTearDown(() async {
      if (!cubit.isClosed) await cubit.close();
      await events.close();
    });
    await cubit.prepareSession(wsId: 'ws');
    await cubit.sendTypedMessage(
      wsId: 'ws',
      text: 'Switch to dark mode',
      attachments: [],
    );
    events.add(
      const AssistantLiveSocketToolCall([
        AssistantLiveFunctionCall(
          id: 'theme-1',
          name: 'execute_workspace_tool',
          args: {'toolName': 'set_theme', 'argumentsJson': '{"theme":"dark"}'},
        ),
      ]),
    );
    await _tick();
  });

  const marker = {'success': true, 'action': 'set_theme', 'theme': 'dark'};

  test('a pending UI action applies within its own turn', () async {
    toolResult.complete(marker);
    await _tick();
    expect(bridge.effects, ['set_theme']);
  });

  test('an interruption cancels a UI action still pending', () async {
    events.add(const AssistantLiveSocketInterrupted());
    await _tick();
    toolResult.complete(marker);
    await _tick();
    expect(bridge.effects, isEmpty);
  });

  test('a new typed turn cancels the previous turn UI action', () async {
    await cubit.sendTypedMessage(
      wsId: 'ws',
      text: 'Never mind',
      attachments: [],
    );
    toolResult.complete(marker);
    await _tick();
    expect(bridge.effects, isEmpty);
  });

  test('a refused send still cancels the previous turn UI action', () async {
    admission = AssistantLiveSinkAdmission.refused;
    final dispatch = await cubit.sendTypedMessage(
      wsId: 'ws',
      text: 'Never mind',
      attachments: [],
    );
    expect(dispatch, AssistantLiveDispatch.refused);
    toolResult.complete(marker);
    await _tick();
    expect(bridge.effects, isEmpty);
  });

  test('a held attachment read cancels the previous turn UI action', () async {
    final file = _File();
    final entered = Completer<void>();
    final bytes = Completer<Uint8List>();
    when(file.readAsBytes).thenAnswer((_) {
      entered.complete();
      return bytes.future;
    });
    await IOOverrides.runZoned(() async {
      final sending = cubit.sendTypedMessage(
        wsId: 'ws',
        text: 'Look at this',
        attachments: const [_image],
      );
      await entered.future;
      toolResult.complete(marker);
      await _tick();
      expect(bridge.effects, isEmpty);
      bytes.complete(img.encodePng(img.Image(width: 1, height: 1)));
      expect(await sending, AssistantLiveDispatch.dispatched);
    }, createFile: (_) => file);
  });
}
