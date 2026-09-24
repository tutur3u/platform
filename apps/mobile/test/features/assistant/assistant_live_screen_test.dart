import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_screen_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements AssistantLiveRepository {}

class _Player extends Mock implements AssistantLiveAudioPlayer {}

class _Camera extends Mock implements AssistantLiveCameraService {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Socket extends Mock implements AssistantLiveSocketClient {}

class _Screen extends AssistantLiveScreenService {
  final controller = StreamController<Map<Object?, Object?>>.broadcast(
    sync: true,
  );
  int stops = 0;
  bool microphoneRequired = false;
  bool startedWithMicrophone = false;
  final microphoneUpdates = <bool>[];
  bool allowed = true;
  Completer<bool>? consent;
  @override
  bool get isSupported => true;
  @override
  bool get requiresMicrophone => microphoneRequired;
  @override
  Stream<Map<Object?, Object?>> get events => controller.stream;
  @override
  Future<bool> start({
    required String notificationTitle,
    required String stopLabel,
    required String stopMessage,
    bool microphoneActive = false,
  }) async {
    startedWithMicrophone = microphoneActive;
    final pending = consent;
    return pending == null ? allowed : await pending.future;
  }

  @override
  Future<void> setMicrophoneActive({required bool active}) async {
    microphoneUpdates.add(active);
  }

  @override
  Future<void> stop() async {
    stops++;
  }
}

class _Cubit extends AssistantLiveCubit {
  _Cubit({
    required super.repository,
    required super.socket,
    required super.audioPlayer,
    required super.recorder,
    required super.cameraService,
    required super.screenService,
  }) : super(onChatBound: (_, _) async {}, onHistoryUpdated: (_, _) async {}) {
    emit(
      const AssistantLiveState(
        workspaceId: 'ws',
        status: AssistantLiveConnectionStatus.connected,
      ),
    );
  }
  void microphone({required bool active}) =>
      emit(state.copyWith(isMicrophoneActive: active));
}

Future<void> _start(AssistantLiveCubit cubit) => cubit.toggleScreenSharing(
  notificationTitle: 'Screen sharing',
  stopLabel: 'Stop',
  stopMessage: 'Stopped',
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  registerFallbackValue(Uint8List(0));
  registerFallbackValue((Uint8List _) {});
  late _Cubit cubit;
  late _Screen screen;
  late _Camera camera;
  late _Socket socket;
  late StreamController<AssistantLiveSocketEvent> events;
  setUp(() {
    final player = _Player();
    final recorder = _Recorder();
    camera = _Camera();
    socket = _Socket();
    screen = _Screen();
    events = StreamController<AssistantLiveSocketEvent>.broadcast();
    when(() => socket.events).thenAnswer((_) => events.stream);
    when(socket.disconnect).thenAnswer((_) async {});
    when(player.clear).thenAnswer((_) async {});
    when(player.dispose).thenAnswer((_) async {});
    when(recorder.stop).thenAnswer((_) async {});
    when(recorder.dispose).thenAnswer((_) async {});
    when(camera.stopStreaming).thenAnswer((_) async {});
    when(camera.dispose).thenAnswer((_) async {});
    cubit = _Cubit(
      repository: _Repository(),
      socket: socket,
      audioPlayer: player,
      recorder: recorder,
      cameraService: camera,
      screenService: screen,
    );
  });
  tearDown(() async {
    await cubit.close();
    await events.close();
    await screen.controller.close();
  });

  test(
    'consented capture sends bounded frames and stops on disconnect',
    () async {
      await _start(cubit);
      expect(cubit.state.isScreenSharingPending, isTrue);
      final frame = Uint8List.fromList([1, 2, 3]);
      screen.controller.add({'type': 'frame', 'bytes': frame});
      verifyNever(() => socket.sendVideoFrame(any()));
      screen.controller.add({'type': 'started'});
      expect(cubit.state.isScreenSharing, isTrue);
      screen.controller.add({
        'type': 'frame',
        'bytes': Uint8List(512 * 1024 + 1),
      });
      verifyNever(() => socket.sendVideoFrame(any()));
      screen.controller.add({'type': 'frame', 'bytes': frame});
      verify(() => socket.sendVideoFrame(frame)).called(1);
      verify(camera.stopStreaming).called(1);
      await cubit.disconnect();
      expect(cubit.state.isScreenSharing, isFalse);
      screen.controller.add({'type': 'frame', 'bytes': frame});
      verifyNever(() => socket.sendVideoFrame(any()));
      expect(screen.stops, greaterThan(0));
    },
  );
  test('system denial and system stop clear the capture state', () async {
    screen.allowed = false;
    await _start(cubit);
    expect(cubit.state.isScreenSharingPending, isFalse);
    screen.allowed = true;
    await _start(cubit);
    screen.controller.add({'type': 'started'});
    screen.controller.add({'type': 'stopped'});
    await Future<void>.delayed(Duration.zero);
    expect(cubit.state.isScreenSharing, isFalse);
  });
  test(
    'iOS requires a real voice session and stops capture on microphone mute',
    () async {
      screen.microphoneRequired = true;
      await _start(cubit);
      expect(cubit.state.screenSharingError, 'microphone_required');
      cubit.microphone(active: true);
      await _start(cubit);
      screen.controller.add({'type': 'started'});
      await cubit.toggleMicrophone();
      expect(cubit.state.isScreenSharing, isFalse);
      expect(cubit.state.isMicrophoneActive, isFalse);
    },
  );
  test(
    'Android mute updates foreground voice state without stopping screen',
    () async {
      cubit.microphone(active: true);
      await _start(cubit);
      expect(screen.startedWithMicrophone, isTrue);
      screen.controller.add({'type': 'started'});
      await cubit.toggleMicrophone();
      expect(cubit.state.isScreenSharing, isTrue);
      expect(screen.microphoneUpdates, [false]);
      expect(screen.stops, 0);
    },
  );
  test(
    'late camera permission cannot replace an active screen share',
    () async {
      final permission = Completer<bool>();
      when(camera.ensurePermission).thenAnswer((_) => permission.future);
      final startingCamera = cubit.toggleCamera();
      await Future<void>.delayed(Duration.zero);
      await _start(cubit);
      screen.controller.add({'type': 'started'});
      permission.complete(true);
      await startingCamera;
      verifyNever(() => camera.startStreaming(any()));
      expect(cubit.state.isScreenSharing, isTrue);
      expect(cubit.state.isCameraActive, isFalse);
    },
  );
  test('late consent after cancellation cannot restart capture', () async {
    screen.consent = Completer<bool>();
    final starting = _start(cubit);
    await Future<void>.delayed(Duration.zero);
    await cubit.stopScreenSharing();
    screen.consent!.complete(true);
    await starting;
    screen.controller.add({'type': 'started'});
    expect(cubit.state.isScreenSharing, isFalse);
    expect(cubit.state.isScreenSharingPending, isFalse);
  });
}
