import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:record/record.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';
import 'view/background_reply_harness.dart';

const _actor = '33333333-3333-4333-8333-333333333333';
const _workspace = '22222222-2222-4222-8222-222222222222';

class _Repository extends ReplyRepository {
  @override
  Future<AssistantCredits> fetchCredits(
    String wsId, {
    bool forceRefresh = false,
  }) async => const AssistantCredits(remaining: 1000, tier: 'PRO');
}

class _RecordingPlatform extends RecordPlatform {
  final permissions = <Completer<bool>>[];
  bool grantFirstPermission = true;
  bool recording = false;
  int captures = 0;

  @override
  Future<void> create(String recorderId) async {}
  @override
  Stream<RecordState> onStateChanged(String recorderId) => const Stream.empty();
  @override
  Future<bool> hasPermission(String recorderId, {bool request = true}) {
    final permission = Completer<bool>();
    permissions.add(permission);
    if (grantFirstPermission && permissions.length == 1) {
      permission.complete(true);
    }
    return permission.future;
  }

  @override
  Future<Stream<Uint8List>> startStream(
    String recorderId,
    RecordConfig config,
  ) async {
    captures++;
    recording = true;
    return const Stream.empty();
  }

  @override
  Future<bool> isRecording(String recorderId) async => recording;
  @override
  Future<Amplitude> getAmplitude(String recorderId) async =>
      Amplitude(current: -160, max: -160);
  @override
  Future<String?> stop(String recorderId) async {
    recording = false;
    return null;
  }

  @override
  Future<void> dispose(String recorderId) async {}
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _HeldTokens extends AssistantLiveRepository {
  final requests = <Completer<AssistantLiveTokenEnvelope>>[];

  @override
  Future<AssistantLiveTokenEnvelope> fetchLiveToken({
    required String wsId,
    String? chatId,
    String? model,
    bool forceFresh = false,
  }) {
    final request = Completer<AssistantLiveTokenEnvelope>();
    requests.add(request);
    return request.future;
  }

  void release(int index) => requests[index].complete(
    const AssistantLiveTokenEnvelope(
      token: 'synthetic-never-connect',
      chatId: 'chat',
      scopeKey: 'scope',
      sessionHandle: null,
      model: 'model',
      seedHistory: [],
    ),
  );
}

class _KeyboardHarness {
  final auth = ReplyAuth();
  final workspace = ReplyWorkspace();
  final repository = _Repository();
  final tokens = _HeldTokens();
  final chrome = AssistantChromeCubit();
  final actions = ShellChromeActionsCubit();
  final dock = ShellDockSlotController();
  final recorder = _RecordingPlatform();
  List<Completer<bool>> get permissions => recorder.permissions;
  late RecordPlatform previousRecorder;
  late AssistantLiveCubit live;

  Future<void> mount(
    WidgetTester tester, {
    bool retain = false,
    bool grantFirstPermission = true,
  }) async {
    recorder.grantFirstPermission = grantFirstPermission;
    previousRecorder = RecordPlatform.instance;
    RecordPlatform.instance = recorder;
    SharedPreferences.setMockInitialValues({
      '$_actor::$assistantKeepLiveWhileBrowsingKeyPrefix$_workspace': retain,
    });
    final messenger = tester.binding.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(
      const MethodChannel('flutter_timezone'),
      (_) async => 'UTC',
    );
    messenger.setMockMethodCallHandler(
      const MethodChannel('flutter_pcm_sound/methods'),
      (_) async => true,
    );
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider.value(value: chrome),
          BlocProvider.value(value: actions),
        ],
        child: ShellDockScope(
          controller: dock,
          child: FloatingShellDock(
            location: '/assistant',
            bottomInset: 68,
            navigation: const SizedBox(height: 52),
            child: AssistantPage(
              repository: repository,
              liveRepository: tokens,
              preferences: AssistantPreferences(
                currentUserId: () => auth.state.user?.id,
              ),
              currentActor: () => auth.state.user?.id,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(AssistantComposerFab));
    await tester.pumpAndSettle();
    live = tester
        .element(find.byType(ShellDockPublisher))
        .read<AssistantLiveCubit>();
    await reopen(tester);
  }

  Future<void> reopen(WidgetTester tester) async {
    chrome.enterLiveMode();
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<void> tap(WidgetTester tester, String control) async {
    await tester.tap(find.byKey(ValueKey('live-control-$control')));
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<void> dispose(WidgetTester tester) async {
    final disconnecting = live.disconnect();
    for (final permission in permissions) {
      if (!permission.isCompleted) permission.complete(false);
    }
    await tester.pump();
    await disconnecting;
    for (var i = 0; i < tokens.requests.length; i++) {
      if (!tokens.requests[i].isCompleted) tokens.release(i);
    }
    await tester.pump(const Duration(seconds: 20));
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await live.close();
    unawaited(repository.stream.close());
    unawaited(repository.replacement.close());
    for (final channel in ['flutter_timezone', 'flutter_pcm_sound/methods']) {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        MethodChannel(channel),
        null,
      );
    }
    await auth.close();
    await workspace.close();
    await chrome.close();
    await actions.close();
    dock.dispose();
    RecordPlatform.instance = previousRecorder;
  }
}

void main() {
  for (final retry in [false, true]) {
    testWidgets('page permission denial releases held token for explicit '
        '${retry ? 'inline Retry' : 'microphone'}', (tester) async {
      final h = _KeyboardHarness();
      await h.mount(tester, grantFirstPermission: false);
      addTearDown(() => h.dispose(tester));
      await h.tap(tester, 'microphone');
      expect(h.tokens.requests, hasLength(1));
      expect(h.permissions, hasLength(1));
      expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
      h.permissions.single.complete(false);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(h.live.state.status, AssistantLiveConnectionStatus.error);
      expect(
        h.live.state.microphonePermission,
        AssistantLivePermissionState.denied,
      );
      expect(h.tokens.requests.single.isCompleted, isFalse);
      expect(h.live.state.isMicrophoneActive, isFalse);
      expect(h.recorder.captures, 0);
      expect(h.permissions, hasLength(1));
      expect(h.tokens.requests, hasLength(1));

      if (retry) {
        final l10n = tester.element(find.byType(AssistantPage)).l10n;
        await tester.tap(find.text(l10n.assistantLiveRetryAction));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
      } else {
        await h.tap(tester, 'microphone');
      }
      expect(h.tokens.requests, hasLength(2));
      expect(h.permissions, hasLength(retry ? 1 : 2));
      expect(h.tokens.requests.first.isCompleted, isFalse);
      expect(h.tokens.requests.last.isCompleted, isFalse);
      expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);

      h.tokens.release(0);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
      expect(h.live.state.isMicrophoneActive, isFalse);
      expect(h.recorder.captures, 0);
      expect(h.tokens.requests.last.isCompleted, isFalse);
      final controls = tester.widget<AssistantLiveCallControls>(
        find.byType(AssistantLiveCallControls),
      );
      await controls.onMicrophone();
      await tester.pump();
      expect(h.tokens.requests, hasLength(2));
      expect(h.permissions, hasLength(retry ? 1 : 2));
      expect(h.recorder.captures, 0);

      if (!retry) {
        expect(h.permissions.last.isCompleted, isFalse);
        h.permissions.last.complete(true);
        await tester.pump();
        expect(h.recorder.captures, 1);
        expect(h.live.state.isMicrophoneActive, isTrue);
        expect(h.tokens.requests.last.isCompleted, isFalse);
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'failed startup keeps recovery visible while retiring preparation',
    (tester) async {
      final h = _KeyboardHarness();
      await h.mount(tester, grantFirstPermission: false);
      addTearDown(() => h.dispose(tester));
      await h.tap(tester, 'microphone');
      expect(h.tokens.requests, hasLength(1));
      expect(h.permissions, hasLength(1));
      h.tokens.requests.single.completeError(
        Exception('startup token failure'),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(h.live.state.status, AssistantLiveConnectionStatus.error);
      expect(h.live.state.error, contains('startup token failure'));
      expect(h.permissions.single.isCompleted, isFalse);
      expect(h.live.state.isMicrophoneActive, isFalse);
      expect(h.recorder.captures, 0);
      final l10n = tester.element(find.byType(AssistantPage)).l10n;
      expect(find.text(l10n.assistantLiveDescriptionError), findsOneWidget);
      await tester.tap(find.text(l10n.assistantLiveRetryAction));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(h.tokens.requests, hasLength(2));
      expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
      h.permissions.single.complete(true);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(h.tokens.requests.last.isCompleted, isFalse);
      expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
      expect(h.live.state.isMicrophoneActive, isFalse);
      expect(h.recorder.captures, 0);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'cancelled page observer cannot retire same-scope Retry failure',
    (tester) async {
      final h = _KeyboardHarness();
      await h.mount(tester, grantFirstPermission: false);
      addTearDown(() => h.dispose(tester));
      await h.tap(tester, 'microphone');
      expect(h.tokens.requests, hasLength(1));
      expect(h.permissions, hasLength(1));
      await h.tap(tester, 'keyboard');
      expect(h.live.state.status, AssistantLiveConnectionStatus.disconnected);
      expect(h.chrome.state.isLiveMode, isFalse);
      await h.reopen(tester);
      final view = tester.widget<AssistantLiveModeView>(
        find.byType(AssistantLiveModeView),
      );
      final retry = view.onRetry();
      await tester.pump();
      expect(h.tokens.requests, hasLength(2));
      expect(h.tokens.requests.first.isCompleted, isFalse);
      expect(h.permissions.single.isCompleted, isFalse);
      h.tokens.requests.last.completeError(Exception('replacement failure'));
      await tester.pump();
      await retry;
      await tester.pump(const Duration(milliseconds: 400));
      expect(h.chrome.state.isLiveMode, isTrue);
      expect(h.live.state.status, AssistantLiveConnectionStatus.error);
      expect(h.live.state.error, contains('replacement failure'));
      expect(h.recorder.captures, 0);

      h.permissions.single.complete(true);
      h.tokens.release(0);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(h.live.state.status, AssistantLiveConnectionStatus.error);
      expect(h.live.state.error, contains('replacement failure'));
      expect(h.live.state.isMicrophoneActive, isFalse);
      expect(h.tokens.requests, hasLength(2));
      expect(h.permissions, hasLength(1));
      expect(h.recorder.captures, 0);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('page keyboard exit releases startup before old awaits settle', (
    tester,
  ) async {
    final h = _KeyboardHarness();
    await h.mount(tester);
    addTearDown(() => h.dispose(tester));
    await h.tap(tester, 'microphone');
    expect(h.tokens.requests, hasLength(1));
    expect(h.permissions, hasLength(1));
    expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
    expect(h.live.state.isMicrophoneActive, isTrue);
    expect(h.recorder.captures, 1);
    await h.tap(tester, 'keyboard');
    expect(h.chrome.state.isLiveMode, isFalse);
    expect(h.live.state.status, AssistantLiveConnectionStatus.disconnected);
    expect(h.tokens.requests.single.isCompleted, isFalse);
    expect(h.live.state.isMicrophoneActive, isFalse);
    expect(find.byType(TextField), findsOneWidget);

    await h.reopen(tester);
    await h.tap(tester, 'microphone');
    expect(h.tokens.requests, hasLength(2));
    expect(h.permissions, hasLength(2));
    expect(h.tokens.requests.first.isCompleted, isFalse);
    expect(h.permissions.last.isCompleted, isFalse);

    // Finishing the old page intent must leave its replacement's gate owned.
    h.tokens.release(0);
    await tester.pump();
    await tester.pump(const Duration(seconds: 20));
    final controls = tester.widget<AssistantLiveCallControls>(
      find.byType(AssistantLiveCallControls),
    );
    await controls.onMicrophone();
    await tester.pump();
    expect(h.tokens.requests, hasLength(2));
    expect(h.permissions, hasLength(2));
    expect(h.live.state.isMicrophoneActive, isFalse);
    expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
    expect(h.recorder.captures, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('opt-in keyboard exit retains the pending session and intent', (
    tester,
  ) async {
    final h = _KeyboardHarness();
    await h.mount(tester, retain: true);
    addTearDown(() => h.dispose(tester));
    await h.tap(tester, 'microphone');
    expect(h.tokens.requests, hasLength(1));
    expect(h.permissions, hasLength(1));
    await h.tap(tester, 'keyboard');
    expect(h.chrome.state.isLiveMode, isFalse);
    expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
    expect(h.tokens.requests.single.isCompleted, isFalse);
    expect(h.live.state.isMicrophoneActive, isTrue);
    expect(h.recorder.recording, isTrue);
    await h.reopen(tester);
    await h.tap(tester, 'microphone');
    expect(h.live.state.isMicrophoneActive, isFalse);
    final controls = tester.widget<AssistantLiveCallControls>(
      find.byType(AssistantLiveCallControls),
    );
    await controls.onMicrophone();
    await tester.pump();
    expect(h.tokens.requests, hasLength(1));
    expect(h.permissions, hasLength(1));
    expect(h.recorder.captures, 1);
    expect(tester.takeException(), isNull);
  });
}
