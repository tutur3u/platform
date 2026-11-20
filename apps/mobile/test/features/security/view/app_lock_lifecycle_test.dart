import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mobile/features/security/view/app_lock_boundary.dart';
import 'package:mobile/features/security/view/app_lock_lifecycle.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Store extends Mock implements AppLockSettingsStore {}

class _LocalAuth extends Mock implements LocalAuthService {}

void main() {
  testWidgets('resume during Add Account locks the protected destination', (
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
    var refreshes = 0;
    var nativeReveals = 0;
    const channel = MethodChannel('mobile/app_snapshot_privacy');
    final messenger = tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(channel, (call) async {
        expect(call.method, 'foregroundFrameReady');
        nativeReveals++;
        return null;
      });
    addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
    final lifecycle = AppLockLifecycle(
      lock: lock,
      hasAccount: () => true,
      onSuspend: (_) {},
      refresh: () => refreshes++,
      now: () => now,
    );
    final addAccount = ValueNotifier(true);
    addTearDown(addAccount.dispose);
    addTearDown(lifecycle.dispose);
    addTearDown(lock.close);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpApp(
      BlocProvider.value(
        value: lock,
        child: AppLockBoundary(
          isExcluded: () => addAccount.value,
          routeChanges: addAccount,
          child: ValueListenableBuilder(
            valueListenable: addAccount,
            builder: (_, active, _) => Text(active ? 'Add Account' : 'Private'),
          ),
        ),
      ),
    );
    refreshes = 0;
    nativeReveals = 0;

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(
      find.byKey(const ValueKey('app-lock-privacy-cover')),
      findsOneWidget,
    );
    expect(find.text('Add Account'), findsNothing);
    expect(nativeReveals, 0);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    now = now.add(const Duration(seconds: 31));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(lock.state.locked, isTrue);
    expect(find.text('Add Account'), findsOneWidget);
    expect(refreshes, 0);
    expect(nativeReveals, 1);

    addAccount.value = false;
    await tester.pump();
    expect(find.text('Private'), findsNothing);
    expect(
      find.byKey(const ValueKey('app-lock-unlock-button')),
      findsOneWidget,
    );
    expect(refreshes, 0);

    pending.complete(true);
    await tester.pump();
    await tester.pump();
    expect(find.text('Private'), findsOneWidget);
    expect(refreshes, 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  test(
    'a stale settings prompt cannot disable or strand a resume lock',
    () async {
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

      final disabling = lock.setEnabled(enabled: false, reason: 'settings');
      lock.lock();
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
}
