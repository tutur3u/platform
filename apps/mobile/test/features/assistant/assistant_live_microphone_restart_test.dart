import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/l10n/l10n.dart';
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
    when(recorder.stop).thenAnswer((_) async {
      stops++;
    });
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
  int stops = 0;
  int microphoneStartCompletions = 0;

  Future<void> toggleMicrophoneFromNavbar() async {
    if (cubit.state.isMicrophoneActive) {
      await cubit.toggleMicrophone();
      return;
    }
    await enableAssistantLiveMicrophone(
      liveCubit: cubit,
      prepareSession:
          cubit.state.status == AssistantLiveConnectionStatus.connected
          ? null
          : () => cubit.prepareSession(wsId: 'ws'),
      isCurrent: () =>
          cubit.state.status != AssistantLiveConnectionStatus.error,
    );
    microphoneStartCompletions++;
  }

  Widget navbar({Future<void> Function()? onText}) => MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(
      body: StreamBuilder<AssistantLiveState>(
        stream: cubit.stream,
        initialData: cubit.state,
        builder: (context, snapshot) => AssistantLiveCallControls(
          state: snapshot.data!,
          onMicrophone: toggleMicrophoneFromNavbar,
          onCamera: cubit.toggleCamera,
          onText: onText ?? () async {},
          onDisconnect: () => cubit.disconnect(clearSession: true),
        ),
      ),
    ),
  );

  Future<void> close() async {
    await cubit.close();
    await events.close();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'navbar cancels delayed startup before permission can open media',
    (tester) async {
      final fixture = _Fixture();
      addTearDown(fixture.close);
      final token = Completer<AssistantLiveTokenEnvelope>();
      final permission = Completer<bool>();
      when(
        () => fixture.repository.fetchLiveToken(
          wsId: 'ws',
          chatId: any(named: 'chatId'),
          model: any(named: 'model'),
          forceFresh: any(named: 'forceFresh'),
        ),
      ).thenAnswer((_) => token.future);
      when(
        fixture.recorder.ensurePermission,
      ).thenAnswer((_) => permission.future);
      var keyboard = 0;
      await tester.pumpWidget(
        fixture.navbar(
          onText: () async {
            keyboard++;
          },
        ),
      );
      await tester.tap(find.byKey(const ValueKey('live-control-microphone')));
      await tester.pump();
      expect(
        fixture.cubit.state.status,
        AssistantLiveConnectionStatus.preparing,
      );
      expect(find.byType(AppIconButton), findsNWidgets(4));
      await tester.tap(find.byKey(const ValueKey('live-control-camera')));
      await tester.tap(find.byKey(const ValueKey('live-control-exit')));
      await tester.pump();
      expect(
        fixture.cubit.state.status,
        AssistantLiveConnectionStatus.disconnected,
      );
      permission.complete(true);
      token.complete(_Fixture.envelope);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(fixture.captures, 0);
      expect(fixture.cubit.state.isMicrophoneActive, isFalse);
      verifyNever(() => fixture.camera.ensurePermission());
      verifyNever(
        () => fixture.socket.connect(
          token: 'token',
          model: 'model',
          seedHistory: const [],
          sessionHandle: any(named: 'sessionHandle'),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('live-control-keyboard')));
      await tester.pump();
      expect(keyboard, 1);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'navbar stops capture before connection completes without restarting it',
    (tester) async {
      final fixture = _Fixture();
      addTearDown(fixture.close);
      final permission = Completer<bool>();
      final connection = Completer<void>();
      final stopped = Completer<void>();
      var permissionRequests = 0;
      var connectionRequests = 0;
      when(fixture.recorder.ensurePermission).thenAnswer((_) {
        permissionRequests++;
        return permission.future;
      });
      when(
        () => fixture.socket.connect(
          token: 'token',
          model: 'model',
          seedHistory: const [],
          sessionHandle: any(named: 'sessionHandle'),
        ),
      ).thenAnswer((_) async {
        connectionRequests++;
        await connection.future;
        fixture.events.add(const AssistantLiveSocketReady());
      });
      await tester.pumpWidget(fixture.navbar());
      final mic = find.byKey(const ValueKey('live-control-microphone'));
      final identity = tester.element(mic);
      final center = tester.getCenter(mic);
      await tester.tap(mic);
      await tester.pump();
      await tester.tap(mic);
      await tester.pump();
      expect(permissionRequests, 1);
      expect(connectionRequests, 1);
      expect(fixture.captures, 0);

      permission.complete(true);
      await tester.pump();
      expect(fixture.cubit.state.isMicrophoneActive, isTrue);
      expect(fixture.captures, 1);
      expect(fixture.microphoneStartCompletions, 0);
      expect(connection.isCompleted, isFalse);
      expect(find.byTooltip('Mute mic'), findsOneWidget);
      final activeButton = tester.widget<AppIconButton>(
        find.descendant(of: mic, matching: find.byType(AppIconButton)),
      );
      expect(activeButton.onPressed, isNotNull);
      when(fixture.recorder.stop).thenAnswer((_) async {
        fixture.stops++;
        await stopped.future;
      });
      await tester.tap(mic);
      await tester.pump();
      await tester.tap(mic);
      await tester.pump();
      expect(fixture.stops, 1);
      expect(fixture.captures, 1);
      stopped.complete();
      await tester.pump();
      expect(fixture.cubit.state.isMicrophoneActive, isFalse);
      expect(connection.isCompleted, isFalse);
      expect(fixture.microphoneStartCompletions, 0);
      verify(() => fixture.socket.endAudioStream()).called(1);
      await tester.tap(mic);
      await tester.pump();
      expect(permissionRequests, 1);
      expect(fixture.captures, 1);

      connection.complete();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(fixture.microphoneStartCompletions, 1);
      expect(
        fixture.cubit.state.status,
        AssistantLiveConnectionStatus.connected,
      );
      expect(fixture.cubit.state.isMicrophoneActive, isFalse);
      expect(fixture.captures, 1);
      expect(fixture.stops, 1);
      expect(permissionRequests, 1);
      expect(connectionRequests, 1);
      expect(tester.element(mic), same(identity));
      expect(tester.getCenter(mic), center);
      verifyNever(() => fixture.camera.ensurePermission());
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('connection completion does not retry denied microphone intent', (
    tester,
  ) async {
    final fixture = _Fixture();
    addTearDown(fixture.close);
    final permission = Completer<bool>();
    final connection = Completer<void>();
    var permissionRequests = 0;
    when(fixture.recorder.ensurePermission).thenAnswer((_) {
      permissionRequests++;
      return permission.future;
    });
    when(
      () => fixture.socket.connect(
        token: 'token',
        model: 'model',
        seedHistory: const [],
        sessionHandle: any(named: 'sessionHandle'),
      ),
    ).thenAnswer((_) async {
      await connection.future;
      fixture.events.add(const AssistantLiveSocketReady());
    });
    await tester.pumpWidget(fixture.navbar());
    await tester.tap(find.byKey(const ValueKey('live-control-microphone')));
    await tester.pump();
    permission.complete(false);
    await tester.pump();
    expect(fixture.cubit.state.status, AssistantLiveConnectionStatus.error);
    expect(
      fixture.cubit.state.microphonePermission,
      AssistantLivePermissionState.denied,
    );
    expect(fixture.captures, 0);
    final stopsAfterDenial = fixture.stops;
    expect(stopsAfterDenial, greaterThan(0));
    connection.complete();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(fixture.microphoneStartCompletions, 1);
    expect(fixture.cubit.state.status, AssistantLiveConnectionStatus.connected);
    expect(fixture.cubit.state.isMicrophoneActive, isFalse);
    expect(
      fixture.cubit.state.microphonePermission,
      AssistantLivePermissionState.denied,
    );
    expect(permissionRequests, 1);
    expect(fixture.captures, 0);
    expect(fixture.stops, stopsAfterDenial);
    expect(tester.takeException(), isNull);
  });

  test(
    'existing connected session enables microphone only for current scope',
    () async {
      final fixture = _Fixture();
      addTearDown(fixture.close);
      when(fixture.recorder.ensurePermission).thenAnswer((_) async => true);
      await fixture.cubit.prepareSession(wsId: 'ws');
      await enableAssistantLiveMicrophone(
        liveCubit: fixture.cubit,
        prepareSession: null,
        isCurrent: () => false,
      );
      verifyNever(fixture.recorder.ensurePermission);
      expect(fixture.captures, 0);
      await enableAssistantLiveMicrophone(
        liveCubit: fixture.cubit,
        prepareSession: null,
        isCurrent: () => true,
      );
      expect(fixture.cubit.state.isMicrophoneActive, isTrue);
      expect(fixture.captures, 1);
      verify(fixture.recorder.ensurePermission).called(1);
    },
  );

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
