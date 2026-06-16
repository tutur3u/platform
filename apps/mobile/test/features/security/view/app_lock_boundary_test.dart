import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
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
  });
}

Future<void> _pumpBoundary(
  WidgetTester tester, {
  required AuthState authState,
  required AppLockState appLockState,
  bool excluded = false,
}) async {
  final authCubit = _MockAuthCubit();
  final appLockCubit = _MockAppLockCubit();

  when(() => authCubit.state).thenReturn(authState);
  whenListen(
    authCubit,
    const Stream<AuthState>.empty(),
    initialState: authState,
  );

  when(() => appLockCubit.state).thenReturn(appLockState);
  whenListen(
    appLockCubit,
    const Stream<AppLockState>.empty(),
    initialState: appLockState,
  );

  await tester.pumpApp(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: authCubit),
        BlocProvider<AppLockCubit>.value(value: appLockCubit),
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
