import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mobile/features/security/view/app_lock_boundary.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockAppLockCubit extends MockCubit<AppLockState>
    implements AppLockCubit {}

class _Store extends Mock implements AppLockSettingsStore {}

class _LocalAuth extends Mock implements LocalAuthService {}

void main() {
  group('AppLockBoundary', () {
    testWidgets('covers authenticated content while lock state is loading', (
      tester,
    ) async {
      await _pumpBoundary(
        tester,
        authState: _authenticatedState(),
        appLockState: const AppLockState(status: AppLockStatus.loading),
      );

      expect(find.byType(NovaLoadingIndicator), findsNothing);
      expect(find.byKey(const ValueKey('app-splash-logo')), findsOneWidget);
      expect(find.text('Sensitive workspace'), findsNothing);
    });

    testWidgets('held settings hydration keeps splash until lock entry', (
      tester,
    ) async {
      final store = _Store();
      final auth = _LocalAuth();
      final held = Completer<bool>();
      when(store.isEnabled).thenAnswer((_) => held.future);
      when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
      when(
        () => auth.authenticate(reason: any(named: 'reason')),
      ).thenAnswer((_) async => false);
      final lock = AppLockCubit(localAuthService: auth, settingsStore: store);
      final account = _MockAuthCubit();
      whenListen(
        account,
        const Stream<AuthState>.empty(),
        initialState: _authenticatedState(),
      );
      final loading = lock.load(lockIfEnabled: true);
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: account),
            BlocProvider<AppLockCubit>.value(value: lock),
          ],
          child: const AppLockBoundary(child: Text('Sensitive workspace')),
        ),
      );
      await tester.pump(const Duration(seconds: 6));
      expect(find.byKey(const ValueKey('app-splash-logo')), findsOneWidget);
      expect(
        tester.getSize(find.byKey(const ValueKey('app-splash-logo'))),
        const Size(104, 104),
      );
      expect(find.byType(NovaLoadingIndicator), findsNothing);
      expect(find.text('Sensitive workspace'), findsNothing);
      expect(
        find.byKey(const ValueKey('app-lock-unlock-button')),
        findsNothing,
      );
      held.complete(true);
      await loading;
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const ValueKey('app-splash-logo')), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 4999));
      expect(
        find.byKey(const ValueKey('app-lock-unlock-button')),
        findsNothing,
      );
      await tester.pump(const Duration(milliseconds: 1));
      expect(
        find.byKey(const ValueKey('app-lock-unlock-button')),
        findsOneWidget,
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await lock.close();
    });

    testWidgets('locked content is excluded from accessibility', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();

      await _pumpBoundary(
        tester,
        authState: _authenticatedState(),
        appLockState: const AppLockState(
          enabled: true,
          locked: true,
          hasLoaded: true,
          status: AppLockStatus.authenticating,
        ),
      );
      expect(find.bySemanticsLabel('Sensitive workspace'), findsNothing);
      semantics.dispose();
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('shows content after lock state loads disabled', (
      tester,
    ) async {
      await _pumpBoundary(
        tester,
        authState: _authenticatedState(),
        appLockState: const AppLockState(hasLoaded: true),
      );

      expect(find.byType(NovaLoadingIndicator), findsNothing);
      expect(find.text('Sensitive workspace'), findsOneWidget);
    });

    testWidgets('allows excluded routes while lock state is loading', (
      tester,
    ) async {
      await _pumpBoundary(
        tester,
        authState: _authenticatedState(),
        appLockState: const AppLockState(status: AppLockStatus.loading),
        excluded: true,
      );

      expect(find.byType(NovaLoadingIndicator), findsNothing);
      expect(find.text('Sensitive workspace'), findsOneWidget);
    });

    testWidgets(
      'centers the lock gate and automatically requests biometric unlock',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        final appLockCubit = _MockAppLockCubit();
        when(
          () => appLockCubit.unlock(reason: any(named: 'reason')),
        ).thenAnswer((_) async => true);

        await _pumpBoundary(
          tester,
          authState: _authenticatedState(),
          appLockState: const AppLockState(
            enabled: true,
            locked: true,
            hasLoaded: true,
          ),
          appLockCubit: appLockCubit,
        );

        expect(find.bySemanticsLabel('Tuturuuu is locked'), findsOneWidget);
        expect(find.text('Protected on this device'), findsNothing);
        expect(find.byKey(const ValueKey('app-splash-logo')), findsOneWidget);
        expect(find.text('Unlock'), findsNothing);
        expect(tester.takeException(), isNull);

        final logoRect = tester.getRect(
          find.byKey(const ValueKey('app-splash-logo')),
        );
        expect(logoRect.center, const Offset(195, 422));
        await tester.pumpWidget(const SizedBox.shrink());

        verify(() => appLockCubit.unlock(reason: 'Unlock Tuturuuu.')).called(1);
      },
    );

    testWidgets('keeps the unlock action reachable on compact screens', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final appLockCubit = _MockAppLockCubit();
      when(
        () => appLockCubit.unlock(reason: any(named: 'reason')),
      ).thenAnswer((_) async => true);

      await _pumpBoundary(
        tester,
        authState: _authenticatedState(),
        appLockState: const AppLockState(
          enabled: true,
          locked: true,
          hasLoaded: true,
        ),
        appLockCubit: appLockCubit,
      );

      expect(tester.takeException(), isNull);
      verify(() => appLockCubit.unlock(reason: 'Unlock Tuturuuu.')).called(1);
      clearInteractions(appLockCubit);
      await tester.pump(const Duration(seconds: 5));
      await tester.ensureVisible(find.text('Unlock'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Unlock'));

      verify(() => appLockCubit.unlock(reason: 'Unlock Tuturuuu.')).called(1);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('shows a centered authenticating state', (tester) async {
      await _pumpBoundary(
        tester,
        authState: _authenticatedState(),
        appLockState: const AppLockState(
          enabled: true,
          locked: true,
          hasLoaded: true,
          status: AppLockStatus.authenticating,
        ),
      );

      expect(find.text('Unlocking...'), findsNothing);
      await tester.pump(const Duration(seconds: 5));
      expect(find.text('Unlocking...'), findsOneWidget);
      expect(find.byType(NovaLoadingIndicator), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
    });
  });
}

Future<void> _pumpBoundary(
  WidgetTester tester, {
  required AuthState authState,
  required AppLockState appLockState,
  bool excluded = false,
  _MockAppLockCubit? appLockCubit,
}) async {
  final authCubit = _MockAuthCubit();
  final resolvedAppLockCubit = appLockCubit ?? _MockAppLockCubit();

  when(() => authCubit.state).thenReturn(authState);
  whenListen(
    authCubit,
    const Stream<AuthState>.empty(),
    initialState: authState,
  );

  when(() => resolvedAppLockCubit.state).thenReturn(appLockState);
  whenListen(
    resolvedAppLockCubit,
    const Stream<AppLockState>.empty(),
    initialState: appLockState,
  );

  await tester.pumpApp(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: authCubit),
        BlocProvider<AppLockCubit>.value(value: resolvedAppLockCubit),
      ],
      child: AppLockBoundary(
        excluded: excluded,
        child: const Text('Sensitive workspace'),
      ),
    ),
  );
}

AuthState _authenticatedState() {
  return AuthState.authenticated(
    supa.User.fromJson({
      'id': 'user-1',
      'aud': 'authenticated',
      'role': 'authenticated',
      'email': 'alex@example.com',
      'app_metadata': const <String, dynamic>{},
      'user_metadata': const <String, dynamic>{},
      'created_at': '2024-01-01T00:00:00.000000Z',
    })!,
  );
}
