import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/login_page.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

void main() {
  group('LoginPage', () {
    late AuthCubit authCubit;

    setUp(() {
      authCubit = _MockAuthCubit();
      when(() => authCubit.signInWithGoogle()).thenAnswer((_) async {});
    });

    testWidgets('renders the Google button', (tester) async {
      const state = AuthState.unauthenticated();
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider.value(value: authCubit, child: const LoginPage()),
      );
      await tester.pump();

      expect(find.text('Continue with Google'), findsOneWidget);
    });

    testWidgets('shows loading copy and disables Google while auth is busy', (
      tester,
    ) async {
      final state = const AuthState.unauthenticated().copyWith(isLoading: true);
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider.value(value: authCubit, child: const LoginPage()),
      );
      await tester.pump();

      expect(find.text('Connecting to Google...'), findsOneWidget);

      await tester.tap(find.text('Connecting to Google...'));
      verifyNever(() => authCubit.signInWithGoogle());
    });
  });
}
