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
    expect(find.text('Private'), findsOneWidget);

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

  testWidgets('Android hides Recents only while App Lock is on', (
    tester,
  ) async {
    final store = _Store();
    var enabled = true;
    when(store.isEnabled).thenAnswer((_) async => enabled);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
    final lock = AppLockCubit(
      localAuthService: _LocalAuth(),
      settingsStore: store,
    );
    addTearDown(lock.close);
    final calls = <Object?>[];
    final messenger = tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(_snapshot, (call) async {
        calls.add('${call.method}:${call.arguments}');
        return null;
      });
    addTearDown(() => messenger.setMockMethodCallHandler(_snapshot, null));
    String? account = 'test-account';
    final lifecycle = AppLockLifecycle(
      lock: lock,
      accountIdentity: () => account,
      onSuspend: (_) {},
      refresh: () {},
      snapshotPlatform: TargetPlatform.android,
    );
    addTearDown(lifecycle.dispose);
    await tester.pump();
    expect(calls, ['setRecentsPrivacy:false']);

    await lock.load();
    await tester.pump();
    expect(calls, ['setRecentsPrivacy:false', 'setRecentsPrivacy:true']);

    enabled = false;
    await lock.load();
    await tester.pump();
    expect(calls, [
      'setRecentsPrivacy:false',
      'setRecentsPrivacy:true',
      'setRecentsPrivacy:false',
    ]);

    enabled = true;
    account = null;
    await lock.load();
    await tester.pump();
    expect(calls, [
      'setRecentsPrivacy:false',
      'setRecentsPrivacy:true',
      'setRecentsPrivacy:false',
    ]);
  });

  testWidgets('a failing Recents bridge never holds the UI', (tester) async {
    final store = _Store();
    when(store.isEnabled).thenAnswer((_) async => true);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.after1Minute);
    final lock = AppLockCubit(
      localAuthService: _LocalAuth(),
      settingsStore: store,
    );
    addTearDown(lock.close);
    final messenger = tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(
        _snapshot,
        (_) async => throw PlatformException(code: 'unavailable'),
      );
    addTearDown(() => messenger.setMockMethodCallHandler(_snapshot, null));
    var refreshes = 0;
    final lifecycle = AppLockLifecycle(
      lock: lock,
      accountIdentity: () => 'test-account',
      onSuspend: (_) {},
      refresh: () => refreshes++,
      snapshotPlatform: TargetPlatform.android,
    );
    addTearDown(lifecycle.dispose);
    await lock.load();
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    await tester.pumpApp(
      BlocProvider.value(
        value: lock,
        child: const AppLockBoundary(child: Text('Private')),
      ),
    );
    await tester.pump();
    final before = refreshes;
    await tester.setAppLifecycle(AppLifecycleState.inactive);
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    await tester.pump();
    expect(find.text('Private'), findsOneWidget);
    expect(refreshes, before + 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a failed Recents update is retried on the next change', (
    tester,
  ) async {
    final store = _Store();
    when(store.isEnabled).thenAnswer((_) async => true);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
    final lock = AppLockCubit(
      localAuthService: _LocalAuth(),
      settingsStore: store,
    );
    addTearDown(lock.close);
    var fail = true;
    final calls = <String>[];
    final messenger = tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(_snapshot, (call) async {
        calls.add('${call.arguments}');
        if (fail) throw PlatformException(code: 'unavailable');
        return null;
      });
    addTearDown(() => messenger.setMockMethodCallHandler(_snapshot, null));
    final lifecycle = AppLockLifecycle(
      lock: lock,
      accountIdentity: () => 'test-account',
      onSuspend: (_) {},
      refresh: () {},
      snapshotPlatform: TargetPlatform.iOS,
    );
    addTearDown(lifecycle.dispose);
    await tester.pump();
    await lock.load();
    await tester.pump();
    expect(calls.last, 'true');
    final attempts = calls.length;
    fail = false;
    await lock.load();
    await tester.pump();
    expect(calls.length, attempts + 1);
    expect(calls.last, 'true');
    await lock.load();
    await tester.pump();
    expect(calls.length, attempts + 1);
  });

  testWidgets('returning from the background locks before resumed', (
    tester,
  ) async {
    final store = _Store();
    when(store.isEnabled).thenAnswer((_) async => true);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
    final lock = AppLockCubit(
      localAuthService: _LocalAuth(),
      settingsStore: store,
    );
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

    lifecycle
      ..didChangeAppLifecycleState(AppLifecycleState.inactive)
      ..didChangeAppLifecycleState(AppLifecycleState.hidden)
      ..didChangeAppLifecycleState(AppLifecycleState.paused)
      ..didChangeAppLifecycleState(AppLifecycleState.hidden);
    expect(lock.state.locked, isFalse);
    lifecycle.didChangeAppLifecycleState(AppLifecycleState.inactive);
    expect(lock.state.locked, isTrue);
  });

  testWidgets('a system prompt without backgrounding never locks', (
    tester,
  ) async {
    final store = _Store();
    when(store.isEnabled).thenAnswer((_) async => true);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.after1Minute);
    final lock = AppLockCubit(
      localAuthService: _LocalAuth(),
      settingsStore: store,
    );
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
    lifecycle
      ..didChangeAppLifecycleState(AppLifecycleState.inactive)
      ..didChangeAppLifecycleState(AppLifecycleState.resumed);
    expect(lock.state.locked, isFalse);
  });

  testWidgets('the return trip still counts toward the lock delay', (
    tester,
  ) async {
    final store = _Store();
    when(store.isEnabled).thenAnswer((_) async => true);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.after30Seconds);
    final lock = AppLockCubit(
      localAuthService: _LocalAuth(),
      settingsStore: store,
    );
    addTearDown(lock.close);
    await lock.load();
    await tester.setAppLifecycle(AppLifecycleState.resumed);
    var now = DateTime(2026);
    final lifecycle = AppLockLifecycle(
      lock: lock,
      accountIdentity: () => 'test-account',
      onSuspend: (_) {},
      refresh: () {},
      now: () => now,
    );
    addTearDown(lifecycle.dispose);
    lifecycle
      ..didChangeAppLifecycleState(AppLifecycleState.inactive)
      ..didChangeAppLifecycleState(AppLifecycleState.hidden)
      ..didChangeAppLifecycleState(AppLifecycleState.paused)
      ..didChangeAppLifecycleState(AppLifecycleState.hidden);
    now = now.add(const Duration(seconds: 29));
    lifecycle.didChangeAppLifecycleState(AppLifecycleState.inactive);
    expect(lock.state.locked, isFalse);
    now = now.add(const Duration(seconds: 2));
    lifecycle.didChangeAppLifecycleState(AppLifecycleState.resumed);
    expect(lock.state.locked, isTrue);
  });
}
