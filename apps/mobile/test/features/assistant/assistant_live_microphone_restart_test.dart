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

class _Fixture {
  _Fixture() {
    when(() => socket.events).thenAnswer((_) => events.stream);
    when(socket.disconnect).thenAnswer((_) async {});
    when(player.initialize).thenAnswer((_) async {});
    when(player.pause).thenAnswer((_) async {});
    when(player.dispose).thenAnswer((_) async {});
    when(recorder.stop).thenAnswer((_) async {});
    when(recorder.dispose).thenAnswer((_) async {});
    when(camera.stopStreaming).thenAnswer((_) async {});
    when(camera.dispose).thenAnswer((_) async {});
    when(
      () => recorder.start(
        onData: any(named: 'onData'),
        onAmplitude: any(named: 'onAmplitude'),
        onError: any(named: 'onError'),
      ),
    ).thenAnswer((_) async => captures++);
    when(
      () => repository.fetchLiveToken(
        wsId: 'ws',
        chatId: any(named: 'chatId'),
        model: any(named: 'model'),
        forceFresh: any(named: 'forceFresh'),
      ),
    ).thenAnswer((_) async => envelope);
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
      onChatBound: (_, _) async {},
      onHistoryUpdated: (_, _) async {},
    );
  }

  static const envelope = AssistantLiveTokenEnvelope(
    token: 'token',
    chatId: 'chat',
    scopeKey: 'scope',
    sessionHandle: null,
    model: 'model',
    seedHistory: [],
  );
  final repository = _Repository();
  final player = _Player();
  final camera = _Camera();
  final recorder = _Recorder();
  final socket = _Socket();
  final events = StreamController<AssistantLiveSocketEvent>();
  late final AssistantLiveCubit cubit;
  int captures = 0;

  Future<void> close() async {
    await cubit.close();
    await events.close();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'cancelled permission cleanup cannot clear replacement startup',
    () async {
      final fixture = _Fixture();
      addTearDown(fixture.close);
      final oldPermission = Completer<bool>();
      final nextPermission = Completer<bool>();
      var permissions = 0;
      when(fixture.recorder.ensurePermission).thenAnswer((_) {
        return switch (++permissions) {
          1 => oldPermission.future,
          2 => nextPermission.future,
          _ => Future.value(true),
        };
      });
      await fixture.cubit.prepareSession(wsId: 'ws');
      final old = fixture.cubit.toggleMicrophone();
      await fixture.cubit.disconnect();
      await fixture.cubit.prepareSession(wsId: 'ws');
      final next = fixture.cubit.toggleMicrophone();
      final requestsAfterRestart = permissions;
      oldPermission.complete(true);
      await old;
      // The obsolete finally must not make the pending replacement look idle.
      final cancelNext = fixture.cubit.toggleMicrophone();
      final requestsAfterCancel = permissions;
      nextPermission.complete(true);
      await Future.wait([next, cancelNext]);
      expect(requestsAfterRestart, 2);
      expect(requestsAfterCancel, 2);
      expect(fixture.cubit.state.isMicrophoneActive, isFalse);
      expect(fixture.captures, 0);
      await fixture.cubit.toggleMicrophone();
      expect(fixture.cubit.state.isMicrophoneActive, isTrue);
      expect(fixture.captures, 1);
    },
  );

  testWidgets('cancelled ready wait cannot block replacement capture', (
    tester,
  ) async {
    final fixture = _Fixture();
    addTearDown(fixture.close);
    final oldToken = Completer<AssistantLiveTokenEnvelope>();
    final nextToken = Completer<AssistantLiveTokenEnvelope>();
    final nextPermission = Completer<bool>();
    var tokens = 0;
    var permissions = 0;
    when(
      () => fixture.repository.fetchLiveToken(
        wsId: 'ws',
        chatId: any(named: 'chatId'),
        model: any(named: 'model'),
        forceFresh: any(named: 'forceFresh'),
      ),
    ).thenAnswer((_) => ++tokens == 1 ? oldToken.future : nextToken.future);
    when(fixture.recorder.ensurePermission).thenAnswer((_) {
      return ++permissions == 2 ? nextPermission.future : Future.value(true);
    });
    final oldSession = fixture.cubit.prepareSession(wsId: 'ws');
    final oldCapture = fixture.cubit.toggleMicrophone();
    await tester.pump();
    expect(fixture.cubit.state.isMicrophoneActive, isTrue);
    await fixture.cubit.disconnect();
    final nextSession = fixture.cubit.prepareSession(wsId: 'ws');
    final nextCapture = fixture.cubit.toggleMicrophone();
    await tester.pump();
    final requestsAfterRestart = permissions;
    oldToken.complete(_Fixture.envelope);
    await oldSession;
    await tester.pump(const Duration(seconds: 20));
    await oldCapture;
    final cancelNext = fixture.cubit.toggleMicrophone();
    final requestsAfterCancel = permissions;
    nextPermission.complete(true);
    nextToken.complete(_Fixture.envelope);
    await nextSession;
    await Future.wait([nextCapture, cancelNext]);
    expect(requestsAfterRestart, 2);
    expect(requestsAfterCancel, 2);
    expect(fixture.cubit.state.status, AssistantLiveConnectionStatus.connected);
    expect(fixture.cubit.state.isMicrophoneActive, isFalse);
    expect(fixture.cubit.state.error, isNull);
    await fixture.cubit.toggleMicrophone();
    expect(fixture.cubit.state.isMicrophoneActive, isTrue);
    expect(fixture.captures, 2);
  });
}
