import 'dart:async';

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
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:record/record.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';
import 'assistant_live_startup_test_helpers.dart';
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
  _RecordingPlatform({required this.holdFirstPermission});
  final bool holdFirstPermission;
  final permissions = <Completer<bool>>[];
  final secondPermissionEntered = Completer<void>();
  bool _retiring = false;
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
    if (permissions.length == 2) secondPermissionEntered.complete();
    if (_retiring) {
      permission.complete(false);
    } else if (permissions.length == 1 && !holdFirstPermission) {
      permission.complete(true);
    }
    return permission.future;
  }

  void retirePermissions() {
    _retiring = true;
    for (final permission in permissions) {
      if (!permission.isCompleted) permission.complete(false);
    }
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

class _CancelRetryDock extends ShellDockSlotController {
  final exits = <Future<void>>[];

  @override
  void publish(Object owner, ShellDockSlot slot) {
    final content = slot.content;
    if (content is! AssistantLiveCallControls) {
      super.publish(owner, slot);
      return;
    }
    super.publish(
      owner,
      ShellDockSlot(
        location: slot.location,
        workspaceId: slot.workspaceId,
        composing: slot.composing,
        expandContent: slot.expandContent,
        primary: slot.primary,
        content: AssistantLiveCallControls(
          key: content.key,
          state: content.state,
          onMicrophone: content.onMicrophone,
          onCamera: content.onCamera,
          onText: content.onText,
          onDisconnect: () {
            final operation = content.onDisconnect();
            exits.add(operation);
            return operation;
          },
        ),
      ),
    );
  }
}

class _CancelRetryHarness {
  _CancelRetryHarness({required bool holdFirstPermission})
    : recorder = _RecordingPlatform(holdFirstPermission: holdFirstPermission);
  final auth = ReplyAuth();
  final workspace = ReplyWorkspace();
  final repository = _Repository();
  final tokens = _HeldTokens();
  final chrome = AssistantChromeCubit();
  final actions = ShellChromeActionsCubit();
  final dock = _CancelRetryDock();
  final _RecordingPlatform recorder;
  List<Completer<bool>> get permissions => recorder.permissions;
  late RecordPlatform previousRecorder;
  late AssistantLiveCubit live;

  Future<void> mount(WidgetTester tester) async {
    previousRecorder = RecordPlatform.instance;
    RecordPlatform.instance = recorder;
    SharedPreferences.setMockInitialValues({
      '$_actor::$assistantKeepLiveWhileBrowsingKeyPrefix$_workspace': false,
    });
    tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(
        const MethodChannel('flutter_timezone'),
        (_) async => 'UTC',
      )
      ..setMockMethodCallHandler(
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
    final previousExits = dock.exits.length;
    if (control == 'exit') {
      final published = dock.slot!.content as AssistantLiveCallControls;
      final rendered = tester.widget<AssistantLiveCallControls>(
        find.byType(AssistantLiveCallControls),
      );
      expect(published.state.status, live.state.status);
      expect(rendered.state, same(published.state));
    }
    await tester.tap(find.byKey(ValueKey('live-control-$control')));
    if (control == 'exit') {
      expect(
        dock.exits,
        hasLength(previousExits + 1),
        reason: 'The rendered Exit must invoke its original page callback.',
      );
      await driveLiveStartupFuture(
        tester,
        dock.exits.last,
        reason:
            'The rendered cancel must finish before checking disconnection.',
      );
    }
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await minimizeLiveCallSurface(tester);
  }

  Future<void> dispose(WidgetTester tester) async {
    final disconnecting = live.disconnect();
    recorder.retirePermissions();
    await tester.pump();
    await drainLiveFixtureCleanup(tester, disconnecting);
    for (var i = 0; i < tokens.requests.length; i++) {
      if (!tokens.requests[i].isCompleted) tokens.release(i);
    }
    await tester.pump(const Duration(seconds: 20));
    await tester.pump();
    await drainLiveFixtureCleanup(tester, live.close());
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    unawaited(repository.stream.close());
    unawaited(repository.replacement.close());
    for (final channel in ['flutter_timezone', 'flutter_pcm_sound/methods']) {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        MethodChannel(channel),
        null,
      );
    }
    await drainLiveFixtureCleanup(tester, () async {
      await auth.close();
      await workspace.close();
      await chrome.close();
      await actions.close();
    }());
    dock.dispose();
    RecordPlatform.instance = previousRecorder;
  }
}

void main() {
  for (final holdFirstPermission in [false, true]) {
    startupTest('rendered cancel retries before old '
        '${holdFirstPermission ? "permission" : "token"} settles', (
      tester,
      cleanup,
    ) async {
      final h = _CancelRetryHarness(holdFirstPermission: holdFirstPermission);
      await h.mount(tester);
      cleanup(() => h.dispose(tester));
      expect(find.byType(AssistantLiveCallControls), findsOneWidget);
      final mic = find.byKey(const ValueKey('live-control-microphone'));
      final identity = tester.element(mic);
      await h.tap(tester, 'microphone');
      expect(h.tokens.requests, hasLength(1));
      expect(h.permissions, hasLength(1));
      expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
      expect(h.recorder.captures, holdFirstPermission ? 0 : 1);
      if (holdFirstPermission) {
        await h.tap(tester, 'microphone');
        expect(h.permissions, hasLength(1));
        expect(h.tokens.requests, hasLength(1));
      }

      await h.tap(tester, 'exit');
      expect(h.live.state.status, AssistantLiveConnectionStatus.disconnected);
      expect(h.live.state.isMicrophoneActive, isFalse);
      expect(h.chrome.state.isLiveMode, isTrue);
      expect(tester.element(mic), same(identity));
      expect(h.tokens.requests.single.isCompleted, isFalse);
      expect(h.permissions.single.isCompleted, !holdFirstPermission);

      await h.tap(tester, 'microphone');
      expect(h.tokens.requests, hasLength(2));
      expect(h.permissions, hasLength(holdFirstPermission ? 1 : 2));
      expect(h.permissions.last.isCompleted, isFalse);
      expect(h.tokens.requests.last.isCompleted, isFalse);
      expect(tester.element(mic), same(identity));

      if (holdFirstPermission) {
        h.permissions.first.complete(true);
        await driveLiveStartupFuture(
          tester,
          h.recorder.secondPermissionEntered.future,
          reason: 'Queued permission must enter after the old dialog settles.',
        );
      }
      expect(h.permissions, hasLength(2));
      expect(h.permissions.last.isCompleted, isFalse);
      h.tokens.release(0);
      // The token-only case also owns the old microphone ready timeout.
      await tester.pump(const Duration(seconds: 20));
      await tester.pump();
      expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
      expect(h.live.state.isMicrophoneActive, isFalse);
      final captures = h.recorder.captures;
      await h.tap(tester, 'microphone');
      expect(h.tokens.requests, hasLength(2));
      expect(h.permissions, hasLength(2));
      expect(h.recorder.captures, captures);
      expect(h.permissions.last.isCompleted, isFalse);
      expect(h.tokens.requests.last.isCompleted, isFalse);

      expect(tester.element(mic), same(identity));
      expect(tester.takeException(), isNull);
    });
  }
}
