import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/view/auth_session_boundary.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mobile/features/security/view/app_lock_boundary.dart';
import 'package:mobile/features/security/view/app_lock_lifecycle.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Store extends Mock implements AppLockSettingsStore {}

class _LocalAuth extends Mock implements LocalAuthService {}

const _snapshot = MethodChannel('mobile/app_snapshot_privacy');

void _reportRaster(WidgetTester tester, int frameNumber) {
  tester.binding.platformDispatcher.onReportTimings!.call([
    FrameTiming(
      vsyncStart: 100,
      buildStart: 101,
      buildFinish: 102,
      rasterStart: 103,
      rasterFinish: 104,
      rasterFinishWallTime: 105,
      frameNumber: frameNumber,
    ),
  ]);
}

void main() {
  testWidgets('feature and app refresh wait for a successful resume unlock', (
    tester,
  ) async {
    final store = _Store();
    final auth = _LocalAuth();
    final pending = Completer<bool>();
    when(store.isEnabled).thenAnswer((_) async => true);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.after30Seconds);
    when(
      () => auth.authenticate(reason: any(named: 'reason')),
    ).thenAnswer((_) => pending.future);
    final lock = AppLockCubit(localAuthService: auth, settingsStore: store);
    await lock.load();
    var now = DateTime(2026);
    final refreshes = <String>[];
    final lifecycle = AppLockLifecycle(
      lock: lock,
      accountIdentity: () => 'test-account',
      onSuspend: (_) {},
      refresh: () => refreshes.add('app'),
      now: () => now,
    );
    addTearDown(lifecycle.dispose);
    addTearDown(lock.close);
    final feature = AppLifecycleListener(
      onResume: () =>
          ForegroundRefresh.request('mailbox', () => refreshes.add('mailbox')),
    );
    addTearDown(feature.dispose);
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    await tester.pumpApp(
      BlocProvider.value(
        value: lock,
        child: const AppLockBoundary(child: Text('Private')),
      ),
    );
    refreshes.clear();

    await tester.setAppLifecycle(AppLifecycleState.inactive);
    await tester.pump();
    expect(
      find.byKey(const ValueKey('app-lock-privacy-cover')),
      findsOneWidget,
    );
    expect(find.text('Private'), findsNothing);

    await tester.setAppLifecycle(AppLifecycleState.paused);
    now = now.add(const Duration(seconds: 31));

    await tester.setAppLifecycle(AppLifecycleState.inactive);
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    await tester.pump();

    expect(find.text('Private'), findsNothing);
    expect(
      find.byKey(const ValueKey('app-lock-unlock-button')),
      findsOneWidget,
    );
    expect(refreshes, isEmpty);
    ForegroundRefresh.request('mailbox', () => refreshes.add('latest mailbox'));
    await tester.pump();
    expect(refreshes, isEmpty);

    await tester.tap(find.byKey(const ValueKey('app-lock-unlock-button')));
    pending.complete(true);
    await tester.pump();
    await tester.pump();
    expect(find.text('Private'), findsOneWidget);
    expect(refreshes, ['app', 'latest mailbox']);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'a stale settings prompt cannot disable or strand a resume lock',
    (tester) async {
      final store = _Store();
      final auth = _LocalAuth();
      final settingsPrompt = Completer<bool>();
      when(store.isEnabled).thenAnswer((_) async => true);
      when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
      when(
        () => auth.authenticate(reason: 'settings'),
      ).thenAnswer((_) => settingsPrompt.future);
      when(
        () => auth.authenticate(reason: 'unlock'),
      ).thenAnswer((_) async => true);
      final lock = AppLockCubit(localAuthService: auth, settingsStore: store);
      addTearDown(lock.close);
      await lock.load();
      await tester.setAppLifecycle(AppLifecycleState.resumed);
      final lifecycle = AppLockLifecycle(
        lock: lock,
        accountIdentity: () => 'test-account',
        onSuspend: (_) {},
        refresh: () {},
      );
      addTearDown(lifecycle.dispose);

      final disabling = lock.setEnabled(enabled: false, reason: 'settings');
      await tester.setAppLifecycle(AppLifecycleState.inactive);

      await tester.setAppLifecycle(AppLifecycleState.paused);
      await tester.setAppLifecycle(AppLifecycleState.resumed);
      expect(lock.state.status, AppLockStatus.authenticating);
      settingsPrompt.complete(true);
      await disabling;

      expect(lock.state.locked, isTrue);
      expect(lock.state.status, AppLockStatus.idle);
      verifyNever(() => store.setEnabled(enabled: false));
      expect(await lock.unlock(reason: 'unlock'), isTrue);
      expect(lock.state.locked, isFalse);
    },
  );

  testWidgets('Android retries required privacy and fences account frames', (
    tester,
  ) async {
    final store = _Store();
    when(store.isEnabled).thenAnswer((_) async => true);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
    final lock = AppLockCubit(
      localAuthService: _LocalAuth(),
      settingsStore: store,
    );
    await lock.load();
    addTearDown(lock.close);

    final account = ValueNotifier<String?>('old');
    addTearDown(account.dispose);
    final prepared = <bool>[];
    final acknowledged = <String>[];
    final failedPreparation = Completer<String>();
    final stale = Completer<String>();
    final release = Completer<String>();
    var oldAccountVisibleAtRelease = false;
    final messenger = tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(_snapshot, (call) async {
        if (call.method == 'preparePrivacyFrame') {
          prepared.add(call.arguments as bool);
          return switch (prepared.length) {
            1 => failedPreparation.future,
            2 => 'old-secure',
            3 => stale.future,
            _ => release.future,
          };
        }
        expect(call.method, 'foregroundFrameReady');
        acknowledged.add(call.arguments as String);
        if (call.arguments == 'signed-out') {
          oldAccountVisibleAtRelease = find
              .text('Account old')
              .evaluate()
              .isNotEmpty;
        }
        return true;
      });
    addTearDown(() => messenger.setMockMethodCallHandler(_snapshot, null));

    await tester.setAppLifecycle(AppLifecycleState.resumed);
    final lifecycle = AppLockLifecycle(
      lock: lock,
      accountIdentity: () => account.value,
      snapshotPlatform: TargetPlatform.android,
      onSuspend: (_) {},
      refresh: () {},
    );
    account.addListener(lifecycle.accountOrLockChanged);
    addTearDown(lifecycle.dispose);
    await tester.pumpApp(
      BlocProvider.value(
        value: lock,
        child: AppLockBoundary(
          nativePrivacyReady: lifecycle.nativePrivacyReady,
          child: ValueListenableBuilder(
            valueListenable: account,
            builder: (_, account, _) => AuthSessionBoundary(
              identity: account,
              child: Text('Account ${account ?? 'signed out'}'),
            ),
          ),
        ),
      ),
    );
    expect(prepared, [true]);
    expect(find.text('Account old'), findsNothing);
    expect(acknowledged, isEmpty);

    failedPreparation.completeError(PlatformException(code: 'bridge'));
    await tester.idle();
    await tester.pump();
    await tester.pump();
    expect(prepared, [true, true]);
    expect(acknowledged, ['old-secure']);
    expect(find.text('Account old'), findsOneWidget);

    account.value = 'new';
    expect(prepared, [true, true, true]);
    await tester.pump();
    expect(find.text('Account new'), findsNothing);

    account.value = null;
    expect(prepared, [true, true, true, false]);
    stale.complete('stale');
    await tester.pump();
    expect(acknowledged, ['old-secure']);
    expect(find.text('Account old'), findsNothing);

    release.complete('signed-out');
    await tester.idle();
    expect(acknowledged, ['old-secure']);
    await tester.pump();
    expect(acknowledged, ['old-secure', 'signed-out']);
    expect(oldAccountVisibleAtRelease, isFalse);
    expect(find.text('Account signed out'), findsOneWidget);
  });

  testWidgets('iOS waits for raster and retries failed acknowledgments', (
    tester,
  ) async {
    final store = _Store();
    when(store.isEnabled).thenAnswer((_) async => false);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
    final lock = AppLockCubit(
      localAuthService: _LocalAuth(),
      settingsStore: store,
    );
    await lock.load();
    addTearDown(lock.close);
    final reveals = <int>[];
    var frame = 40;
    final messenger = tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(_snapshot, (call) async {
        if (call.method == 'snapshotActivation') return 7;
        reveals.add(call.arguments as int);
        if (reveals.length <= 4) throw PlatformException(code: 'bridge');
        return true;
      });
    addTearDown(() => messenger.setMockMethodCallHandler(_snapshot, null));
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    final lifecycle = AppLockLifecycle(
      lock: lock,
      accountIdentity: () => 'test-account',
      snapshotPlatform: TargetPlatform.iOS,
      readFrameNumber: () => frame,
      onSuspend: (_) {},
      refresh: () {},
    );
    addTearDown(lifecycle.dispose);
    await tester.pump();
    await tester.pump();
    _reportRaster(tester, frame - 1);
    await tester.idle();
    expect(reveals, isEmpty);

    // A lost timing report cannot make the cover open. It requests a new frame.
    frame++;
    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    _reportRaster(tester, frame - 1);
    await tester.idle();
    expect(reveals, isEmpty);

    for (var attempt = 1; attempt <= 5; attempt++) {
      _reportRaster(tester, frame);
      await tester.idle();
      expect(reveals, List.filled(attempt, 7));
      if (attempt < 5) {
        frame++;
        await tester.pump();
        await tester.pump();
      }
    }
  });

  testWidgets('already resumed startup submits only the current activation', (
    tester,
  ) async {
    final store = _Store();
    when(store.isEnabled).thenAnswer((_) async => false);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
    final lock = AppLockCubit(
      localAuthService: _LocalAuth(),
      settingsStore: store,
    );
    await lock.load();
    addTearDown(lock.close);
    final stale = Completer<int>();
    final reveals = <int>[];
    var activations = 0;
    var frame = 50;
    final messenger = tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(_snapshot, (call) async {
        if (call.method == 'snapshotActivation') {
          return ++activations == 2 ? stale.future : activations;
        }
        expect(call.method, 'foregroundFrameReady');
        reveals.add(call.arguments as int);
        return true;
      });
    addTearDown(() => messenger.setMockMethodCallHandler(_snapshot, null));
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    final lifecycle = AppLockLifecycle(
      lock: lock,
      accountIdentity: () => 'test-account',
      snapshotPlatform: TargetPlatform.iOS,
      readFrameNumber: () => frame,
      onSuspend: (_) {},
      refresh: () {},
    );
    addTearDown(lifecycle.dispose);
    await tester.pump();
    await tester.pump();
    _reportRaster(tester, frame);
    await tester.idle();
    expect(reveals, [1]);

    await tester.setAppLifecycle(AppLifecycleState.inactive);
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    await tester.pump();
    expect(activations, 2);
    await tester.setAppLifecycle(AppLifecycleState.inactive);
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    stale.complete(2);
    frame++;
    await tester.pump();
    await tester.pump();
    _reportRaster(tester, frame);
    await tester.idle();
    expect(reveals, [1, 3]);
  });
}
