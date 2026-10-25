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
}
