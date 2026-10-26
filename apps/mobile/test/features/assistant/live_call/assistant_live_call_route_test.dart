import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/view/assistant_live_call_screen.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';
import 'package:mocktail/mocktail.dart';

import 'live_call_harness.dart';

class _Repository extends Mock implements AssistantLiveRepository {}

class _Player extends Mock implements AssistantLiveAudioPlayer {}

class _Camera extends Mock implements AssistantLiveCameraService {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Socket extends Mock implements AssistantLiveSocketClient {}

class _Cubit extends AssistantLiveCubit {
  _Cubit({
    required super.repository,
    required super.socket,
    required super.audioPlayer,
    required super.recorder,
    required super.cameraService,
  }) : super(onChatBound: (_, _) async {}, onHistoryUpdated: (_, _) async {});

  void show(AssistantLiveState next) => emit(next);
}

_Cubit _cubit() {
  final socket = _Socket();
  final player = _Player();
  final recorder = _Recorder();
  final camera = _Camera();
  when(() => socket.events).thenAnswer((_) => const Stream.empty());
  when(socket.disconnect).thenAnswer((_) async {});
  when(player.dispose).thenAnswer((_) async {});
  when(player.pause).thenAnswer((_) async {});
  when(recorder.stop).thenAnswer((_) async {});
  when(recorder.dispose).thenAnswer((_) async {});
  when(camera.stopStreaming).thenAnswer((_) async {});
  when(camera.dispose).thenAnswer((_) async {});
  return _Cubit(
    repository: _Repository(),
    socket: socket,
    audioPlayer: player,
    recorder: recorder,
    cameraService: camera,
  );
}

Widget _app(Widget home) => MaterialApp(
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: Scaffold(body: home),
);

Widget _modeView(AssistantLiveState state, Future<void> Function() onReturn) =>
    AssistantLiveModeView(
      chatState: const AssistantChatState(fallbackChatId: 'chat'),
      liveState: state,
      liveUiState: const AssistantLiveUiState(
        kind: AssistantLiveUiKind.live,
        tone: AssistantLiveUiTone.positive,
        workspaceTier: 'PRO',
        activeTier: 'PRO',
        creditSource: AssistantCreditSource.workspace,
        isEligible: true,
        isVisibleLiveSession: true,
      ),
      assistantName: 'Mira',
      scrollController: ScrollController(),
      onRetry: () async {},
      onToggleMicrophone: () async {},
      onToggleCamera: () async {},
      onDisconnect: () async {},
      onOpenTextEntry: () async {},
      onReturnToCall: onReturn,
    );

void main() {
  const returnKey = ValueKey('live-return-to-call');

  testWidgets('minimized active calls offer a way back to the call', (
    tester,
  ) async {
    var returns = 0;
    Future<void> onReturn() async => returns++;
    for (final status in [
      AssistantLiveConnectionStatus.connecting,
      AssistantLiveConnectionStatus.connected,
    ]) {
      await tester.pumpWidget(
        _app(_modeView(AssistantLiveState(status: status), onReturn)),
      );
      expect(find.byKey(returnKey), findsOneWidget, reason: '$status');
    }
    await tester.tap(find.byKey(returnKey));
    expect(returns, 1);

    await tester.pumpWidget(
      _app(_modeView(const AssistantLiveState(hasEnded: true), onReturn)),
    );
    expect(find.byKey(returnKey), findsNothing);
  });

  testWidgets('call opens above the host; minimize keeps the call running', (
    tester,
  ) async {
    final cubit = _cubit();
    addTearDown(cubit.close);
    cubit.show(
      AssistantLiveState(
        status: AssistantLiveConnectionStatus.connected,
        callStartedAt: DateTime.now(),
      ),
    );
    final log = LiveCallActionLog();
    late BuildContext host;
    await tester.pumpWidget(
      _app(
        Builder(
          builder: (context) {
            host = context;
            return const Text('host page');
          },
        ),
      ),
    );
    unawaited(
      AssistantLiveCallScreen.show(
        host,
        cubit: cubit,
        assistantName: 'Mira',
        actions: (route) => AssistantLiveCallActions(
          toggleMicrophone: log.actions.toggleMicrophone,
          toggleCamera: log.actions.toggleCamera,
          openKeyboard: log.actions.openKeyboard,
          end: log.actions.end,
          callAgain: log.actions.callAgain,
          minimize: () => Navigator.of(route).maybePop(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(AssistantLiveCallScreen), findsOneWidget);
    expect(find.byKey(const ValueKey('assistant-live-call-timer')), findsOne);

    await tester.tap(find.bySemanticsLabel('Minimize'));
    await tester.pumpAndSettle();
    expect(find.byType(AssistantLiveCallScreen), findsNothing);
    expect(find.text('host page'), findsOneWidget);
    expect(cubit.isClosed, isFalse);
    expect(cubit.state.status, AssistantLiveConnectionStatus.connected);
  });

  testWidgets('a closed session dismisses its call surface', (tester) async {
    final cubit = _cubit()
      ..show(
        AssistantLiveState(
          status: AssistantLiveConnectionStatus.connected,
          callStartedAt: DateTime.now(),
        ),
      );
    late BuildContext host;
    await tester.pumpWidget(
      _app(
        Builder(
          builder: (context) {
            host = context;
            return const SizedBox();
          },
        ),
      ),
    );
    unawaited(
      AssistantLiveCallScreen.show(
        host,
        cubit: cubit,
        assistantName: 'Mira',
        actions: (_) => LiveCallActionLog().actions,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(AssistantLiveCallScreen), findsOneWidget);

    // Native teardown awaits real stream cancellation, so let real event-loop
    // turns and frames alternate until the cubit has closed.
    var closed = false;
    unawaited(cubit.close().whenComplete(() => closed = true));
    for (var i = 0; i < 20 && !closed; i++) {
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(closed, isTrue);
    await tester.pumpAndSettle();
    expect(find.byType(AssistantLiveCallScreen), findsNothing);
  });

  testWidgets('a page disconnect without finishTurn ends the surface', (
    tester,
  ) async {
    final cubit = _cubit();
    addTearDown(cubit.close);
    cubit.show(
      AssistantLiveState(
        status: AssistantLiveConnectionStatus.connected,
        callStartedAt: DateTime.now(),
      ),
    );
    await _present(tester, cubit);
    expect(find.byKey(const ValueKey('assistant-live-call-end')), findsOne);

    // Backgrounding and hidden-page teardown call disconnect() without
    // finishTurn; the surface must not fall back to "Connecting…".
    await cubit.disconnect();
    await tester.pumpAndSettle();
    expect(find.byType(AssistantLiveCallScreen), findsOneWidget);
    expect(find.text('Connecting…'), findsNothing);
    expect(find.textContaining('Call ended'), findsOneWidget);
    expect(find.byKey(const ValueKey('assistant-live-call-end')), findsNothing);
    expect(find.byKey(const ValueKey('assistant-live-call-again')), findsOne);
  });

  testWidgets('a start attempt that never starts dismisses the surface', (
    tester,
  ) async {
    final cubit = _cubit();
    addTearDown(cubit.close);
    final attempt = Completer<void>();
    await _present(tester, cubit, startAttempt: attempt.future);
    expect(find.text('Connecting…'), findsOneWidget);
    attempt.complete();
    await _pumpRoute(tester);
    expect(find.byType(AssistantLiveCallScreen), findsNothing);
  });

  testWidgets('a started session keeps the surface after its start settles', (
    tester,
  ) async {
    final cubit = _cubit();
    addTearDown(cubit.close);
    final attempt = Completer<void>();
    await _present(tester, cubit, startAttempt: attempt.future);
    cubit.show(
      const AssistantLiveState(status: AssistantLiveConnectionStatus.preparing),
    );
    await tester.pump();
    cubit.show(
      const AssistantLiveState(status: AssistantLiveConnectionStatus.error),
    );
    attempt.complete();
    await _pumpRoute(tester);
    expect(find.byType(AssistantLiveCallScreen), findsOneWidget);
    expect(find.text("Couldn't connect"), findsOneWidget);
  });

  testWidgets('returning to a call that just dropped shows it ended', (
    tester,
  ) async {
    final cubit = _cubit();
    addTearDown(cubit.close);
    // Return to call has no start attempt; a session that dropped just before
    // it opened must not wait on Connecting for a start that never comes.
    await _present(tester, cubit);
    expect(find.text('Connecting…'), findsNothing);
    expect(find.text('Call ended'), findsOneWidget);
    expect(find.byKey(const ValueKey('assistant-live-call-again')), findsOne);
  });

  testWidgets('session close removes only the call route under a cover', (
    tester,
  ) async {
    final cubit = _cubit()
      ..show(
        AssistantLiveState(
          status: AssistantLiveConnectionStatus.connected,
          callStartedAt: DateTime.now(),
        ),
      );
    await _present(tester, cubit);
    final call = tester.element(find.byType(AssistantLiveCallScreen));
    unawaited(
      Navigator.of(call, rootNavigator: true).push<void>(
        MaterialPageRoute(builder: (_) => const Text('covering page')),
      ),
    );
    await _pumpRoute(tester);
    expect(find.text('covering page'), findsOneWidget);

    var closed = false;
    unawaited(cubit.close().whenComplete(() => closed = true));
    for (var i = 0; i < 20 && !closed; i++) {
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump(const Duration(milliseconds: 50));
    }
    await _pumpRoute(tester);
    expect(
      find.byType(AssistantLiveCallScreen, skipOffstage: false),
      findsNothing,
    );
    expect(find.text('covering page'), findsOneWidget);
  });
}

Future<void> _present(
  WidgetTester tester,
  AssistantLiveCubit cubit, {
  Future<void>? startAttempt,
}) async {
  late BuildContext host;
  await tester.pumpWidget(
    _app(
      Builder(
        builder: (context) {
          host = context;
          return const SizedBox();
        },
      ),
    ),
  );
  unawaited(
    AssistantLiveCallScreen.show(
      host,
      cubit: cubit,
      assistantName: 'Mira',
      actions: (_) => LiveCallActionLog().actions,
      startAttempt: startAttempt,
    ),
  );
  // The connecting ring repeats, so pump the route transition, not settle.
  await _pumpRoute(tester);
  expect(find.byType(AssistantLiveCallScreen), findsOneWidget);
}

Future<void> _pumpRoute(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
}
