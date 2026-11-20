import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
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
      hasAccount: () => true,
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
        hasAccount: () => true,
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
    final messenger = tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(_snapshot, (call) async {
        if (call.method == 'snapshotActivation') {
          return ++activations == 2 ? stale.future : activations;
        }
        expect(call.method, 'foregroundFrameReady');
        reveals.add(call.arguments as int);
        return null;
      });
    addTearDown(() => messenger.setMockMethodCallHandler(_snapshot, null));
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    final lifecycle = AppLockLifecycle(
      lock: lock,
      hasAccount: () => true,
      onSuspend: (_) {},
      refresh: () {},
    );
    addTearDown(lifecycle.dispose);
    await tester.pump();
    await tester.pump();
    expect(reveals, [1]);

    await tester.setAppLifecycle(AppLifecycleState.inactive);
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    await tester.pump();
    expect(activations, 2);
    await tester.setAppLifecycle(AppLifecycleState.inactive);
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    stale.complete(2);
    await tester.pump();
    await tester.pump();
    expect(reveals, [1, 3]);
  });
}
