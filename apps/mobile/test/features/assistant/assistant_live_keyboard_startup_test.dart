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
import 'package:mobile/features/assistant/view/assistant_live_call_screen.dart';
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
import 'assistant_live_startup_test_helpers.dart';
import 'view/background_reply_harness.dart';

part 'assistant_live_keyboard_startup_harness.dart';

void main() {
  for (final retry in [false, true]) {
    startupTest('page permission denial releases held token for explicit '
        '${retry ? 'inline Retry' : 'microphone'}', (tester, cleanup) async {
      final h = _KeyboardHarness();
      await h.mount(tester, grantFirstPermission: false);
      cleanup(() => h.dispose(tester));
      await h.startMicrophone(tester);
      expect(h.tokens.requests, hasLength(1));
      expect(h.permissions, hasLength(1));
      expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
      h.permissions.single.complete(false);
      await h.renderLiveStatus(tester, AssistantLiveConnectionStatus.error);
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
        await h.retry(tester);
      } else {
        await h.startMicrophone(tester);
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

  startupTest(
    'failed startup keeps recovery visible while retiring preparation',
    (tester, cleanup) async {
      final h = _KeyboardHarness();
      await h.mount(tester, grantFirstPermission: false);
      cleanup(() => h.dispose(tester));
      await h.startMicrophone(tester);
      expect(h.tokens.requests, hasLength(1));
      expect(h.permissions, hasLength(1));
      h.tokens.requests.single.completeError(
        Exception('startup token failure'),
      );
      await h.renderLiveStatus(tester, AssistantLiveConnectionStatus.error);
      expect(h.live.state.status, AssistantLiveConnectionStatus.error);
      expect(h.live.state.error, contains('startup token failure'));
      expect(h.permissions.single.isCompleted, isFalse);
      expect(h.live.state.isMicrophoneActive, isFalse);
      expect(h.recorder.captures, 0);
      final l10n = tester.element(find.byType(AssistantPage)).l10n;
      expect(find.text(l10n.assistantLiveDescriptionError), findsOneWidget);
      await h.retry(tester);
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

  startupTest(
    'cancelled page observer cannot retire same-scope Retry failure',
    (tester, cleanup) async {
      final h = _KeyboardHarness();
      await h.mount(tester, grantFirstPermission: false);
      cleanup(() => h.dispose(tester));
      await h.startMicrophone(tester);
      expect(h.tokens.requests, hasLength(1));
      expect(h.permissions, hasLength(1));
      final originalStart = h.dock.actions['microphone']!.single;
      await h.tap(tester, 'keyboard', completes: true);
      expect(h.live.state.status, AssistantLiveConnectionStatus.disconnected);
      expect(h.chrome.state.isLiveMode, isFalse);
      await h.reopen(tester);
      final view = tester.widget<AssistantLiveModeView>(
        find.byType(AssistantLiveModeView),
      );
      final entering = h.tokens.entered(2);
      final retry = view.onRetry();
      await driveLiveStartupFuture(
        tester,
        entering,
        reason: 'The replacement Retry must enter before its token fails.',
      );
      expect(h.tokens.requests, hasLength(2));
      expect(h.tokens.requests.first.isCompleted, isFalse);
      expect(h.permissions.single.isCompleted, isFalse);
      h.tokens.requests.last.completeError(Exception('replacement failure'));
      await tester.pump();
      await driveLiveStartupFuture(
        tester,
        retry,
        reason: 'The replacement Retry must release its failed attempt.',
      );
      await tester.pump(const Duration(milliseconds: 400));
      expect(h.chrome.state.isLiveMode, isTrue);
      expect(h.live.state.status, AssistantLiveConnectionStatus.error);
      expect(h.live.state.error, contains('replacement failure'));
      expect(h.recorder.captures, 0);

      h.permissions.single.complete(true);
      h.tokens.release(0);
      await driveLiveStartupFuture(
        tester,
        originalStart,
        reason: 'The cancelled page observer must finish after old inputs.',
      );
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

  startupTest('page keyboard exit releases startup before old awaits settle', (
    tester,
    cleanup,
  ) async {
    final h = _KeyboardHarness();
    await h.mount(tester);
    cleanup(() => h.dispose(tester));
    await h.startMicrophone(tester);
    expect(h.tokens.requests, hasLength(1));
    expect(h.permissions, hasLength(1));
    expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
    expect(h.live.state.isMicrophoneActive, isTrue);
    expect(h.recorder.captures, 1);
    await h.tap(tester, 'keyboard', completes: true);
    expect(h.chrome.state.isLiveMode, isFalse);
    expect(h.live.state.status, AssistantLiveConnectionStatus.disconnected);
    expect(h.tokens.requests.single.isCompleted, isFalse);
    expect(h.live.state.isMicrophoneActive, isFalse);
    expect(find.byType(TextField), findsOneWidget);

    await h.reopen(tester);
    await h.startMicrophone(tester);
    expect(h.tokens.requests, hasLength(2));
    expect(h.permissions, hasLength(2));
    expect(h.tokens.requests.first.isCompleted, isFalse);
    expect(h.permissions.last.isCompleted, isFalse);

    // Deliver the stale token while the replacement still owns its page gate.
    // The obsolete capture's ready timeout is drained only during teardown.
    h.tokens.release(0);
    await driveLiveStartupFuture(
      tester,
      h.tokens.requests.first.future.then<void>((_) {}),
      reason:
          'The cancelled token must return without a ready-timeout advance.',
    );
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

  startupTest('opt-in keyboard exit retains the pending session and intent', (
    tester,
    cleanup,
  ) async {
    final h = _KeyboardHarness();
    await h.mount(tester, retain: true);
    cleanup(() => h.dispose(tester));
    await h.startMicrophone(tester);
    expect(h.tokens.requests, hasLength(1));
    expect(h.permissions, hasLength(1));
    await h.tap(tester, 'keyboard', completes: true);
    expect(h.chrome.state.isLiveMode, isFalse);
    expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
    expect(h.tokens.requests.single.isCompleted, isFalse);
    expect(h.live.state.isMicrophoneActive, isTrue);
    expect(h.recorder.recording, isTrue);
    await h.reopen(tester);
    await h.tap(tester, 'microphone', completes: true);
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

  startupTest('the presented call surface never hangs up the call it starts', (
    tester,
    cleanup,
  ) async {
    final h = _KeyboardHarness();
    await h.mount(tester);
    cleanup(() => h.dispose(tester));
    final entering = h.tokens.entered(1);
    await tester.tap(find.byKey(const ValueKey('live-control-microphone')));
    await driveLiveStartupFuture(
      tester,
      entering,
      reason: 'Starting a call must enter its token request.',
    );
    // Covering the page disables its tickers; the page's own call surface
    // must not trigger the hidden-page Live teardown.
    for (var i = 0; i < 3; i++) {
      await tester.pump(const Duration(milliseconds: 400));
    }
    expect(find.byType(AssistantLiveCallScreen), findsOneWidget);
    expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
    expect(h.chrome.state.isLiveMode, isTrue);

    await minimizeLiveCallSurface(tester);
    expect(find.byType(AssistantLiveCallScreen), findsNothing);
    expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
    expect(find.byKey(const ValueKey('live-return-to-call')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  Future<_KeyboardHarness> startPresentedCall(
    WidgetTester tester,
    LiveStartupCleanup cleanup,
  ) async {
    final h = _KeyboardHarness();
    await h.mount(tester);
    cleanup(() => h.dispose(tester));
    final entering = h.tokens.entered(1);
    await tester.tap(find.byKey(const ValueKey('live-control-microphone')));
    await driveLiveStartupFuture(
      tester,
      entering,
      reason: 'Starting a call must enter its token request.',
    );
    for (var i = 0; i < 3; i++) {
      await tester.pump(const Duration(milliseconds: 400));
    }
    expect(find.byType(AssistantLiveCallScreen), findsOneWidget);
    expect(h.live.state.status, AssistantLiveConnectionStatus.preparing);
    return h;
  }

  // Page teardown runs real audio cleanup; release the held token and let
  // real event-loop turns alternate with frames until the session is idle.
  Future<void> settleDisconnect(WidgetTester tester, _KeyboardHarness h) async {
    for (var i = 0; i < h.tokens.requests.length; i++) {
      if (!h.tokens.requests[i].isCompleted) h.tokens.release(i);
    }
    for (var i = 0; i < 40; i++) {
      if (h.live.state.status == AssistantLiveConnectionStatus.disconnected) {
        break;
      }
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump(const Duration(milliseconds: 50));
    }
    await tester.pump(const Duration(milliseconds: 400));
  }

  startupTest('backgrounding a presented call shows it ended on resume', (
    tester,
    cleanup,
  ) async {
    final h = await startPresentedCall(tester, cleanup);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await settleDisconnect(tester, h);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump(const Duration(milliseconds: 400));
    expect(h.live.state.status, AssistantLiveConnectionStatus.disconnected);
    expect(h.live.state.hasEnded, isFalse);
    expect(find.byType(AssistantLiveCallScreen), findsOneWidget);
    expect(find.text('Connecting…'), findsNothing);
    expect(find.text('Call ended'), findsOneWidget);
    expect(find.byKey(const ValueKey('assistant-live-call-end')), findsNothing);
    expect(find.byKey(const ValueKey('assistant-live-call-again')), findsOne);
    await minimizeLiveCallSurface(tester);
    expect(find.byType(AssistantLiveCallScreen), findsNothing);
    expect(tester.takeException(), isNull);
  });

  startupTest('a workspace switch dismisses the presented call', (
    tester,
    cleanup,
  ) async {
    final h = await startPresentedCall(tester, cleanup);
    h.workspace.change('44444444-4444-4444-8444-444444444444');
    await settleDisconnect(tester, h);
    expect(find.byType(AssistantLiveCallScreen), findsNothing);
    expect(h.live.state.status, AssistantLiveConnectionStatus.disconnected);
    expect(tester.takeException(), isNull);
  });
}
