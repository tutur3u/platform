import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/view/app_lock_boundary.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockAppLockCubit extends MockCubit<AppLockState>
    implements AppLockCubit {}

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

      expect(find.byType(NovaLoadingIndicator), findsOneWidget);
      expect(find.text('Sensitive workspace'), findsNothing);
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

        expect(find.text('Tuturuuu is locked'), findsOneWidget);
        expect(find.text('Protected on this device'), findsNothing);
        expect(find.byIcon(Icons.lock_outline_rounded), findsOneWidget);
        expect(tester.takeException(), isNull);

        final cardRect = tester.getRect(
          find.byKey(const ValueKey('app-lock-card')),
        );
        final buttonRect = tester.getRect(
          find.byKey(const ValueKey('app-lock-unlock-button')),
        );
        final buttonContentRect = tester.getRect(
          find.byKey(const ValueKey('app-lock-unlock-content')),
        );

        expect(cardRect.center.dx, closeTo(195, 0.1));
        expect(cardRect.center.dy, closeTo(422, 0.1));
        expect(buttonRect.center.dx, closeTo(195, 0.1));
        expect(buttonContentRect.center.dx, closeTo(buttonRect.center.dx, 0.1));

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
      await tester.ensureVisible(find.text('Unlock'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Unlock'));

      verify(() => appLockCubit.unlock(reason: 'Unlock Tuturuuu.')).called(1);
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

      expect(find.text('Unlocking...'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
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
