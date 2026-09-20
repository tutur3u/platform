import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/mfa_approval/data/mfa_approval_repository.dart';
import 'package:mobile/features/security/mfa_approval/view/mfa_approval_listener.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;
import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockAppLockCubit extends MockCubit<AppLockState>
    implements AppLockCubit {}

class _MockMfaApprovalRepository extends Mock
    implements MfaApprovalRepository {}

void main() {
  group('MobileMfaApprovalListener', () {
    late _MockAuthCubit authCubit;
    late _MockAppLockCubit appLockCubit;
    late _MockMfaApprovalRepository repository;

    setUp(() {
      authCubit = _MockAuthCubit();
      appLockCubit = _MockAppLockCubit();
      repository = _MockMfaApprovalRepository();

      final authState = AuthState.authenticated(
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

      when(() => authCubit.state).thenReturn(authState);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: authState,
      );

      const appLockState = AppLockState(enabled: true);
      when(() => appLockCubit.state).thenReturn(appLockState);
      whenListen(
        appLockCubit,
        const Stream<AppLockState>.empty(),
        initialState: appLockState,
      );
    });

    testWidgets('shows a dialog when a web MFA request is pending', (
      tester,
    ) async {
      when(() => repository.listPending()).thenAnswer(
        (_) async => (
          approvals: [
            PendingMfaApproval(
              id: 'challenge-1',
              pairCode: 'ABCD12',
              expiresAt: DateTime.now().add(const Duration(minutes: 2)),
              createdAt: DateTime.now(),
            ),
          ],
          requiresMobileMfa: false,
          error: null,
        ),
      );

      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: authCubit),
            BlocProvider<AppLockCubit>.value(value: appLockCubit),
          ],
          child: MobileMfaApprovalListener(
            repository: repository,
            pollInterval: const Duration(minutes: 5),
            child: const SizedBox.shrink(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Is this your sign-in?'), findsOneWidget);
      expect(find.text('ABCD12'), findsNothing);
      expect(find.text('Deny request'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      verify(() => repository.listPending()).called(1);
    });
  });
}
