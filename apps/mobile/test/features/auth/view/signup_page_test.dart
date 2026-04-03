import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/signup_page.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

void main() {
  group('SignUpPage', () {
    late AuthCubit authCubit;

    setUp(() {
      authCubit = _MockAuthCubit();
      when(() => authCubit.signInWithApple()).thenAnswer((_) async {});
      when(() => authCubit.signInWithGoogle()).thenAnswer((_) async {});
      when(() => authCubit.signInWithMicrosoft()).thenAnswer((_) async {});
      when(() => authCubit.signInWithGithub()).thenAnswer((_) async {});
    });

    testWidgets('renders all web-parity social buttons', (tester) async {
      const state = AuthState.unauthenticated();
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider.value(value: authCubit, child: const SignUpPage()),
      );
      await tester.pump();

      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('Continue with Microsoft'), findsOneWidget);
      expect(find.text('Continue with Apple'), findsOneWidget);
      expect(find.text('Continue with GitHub'), findsOneWidget);
      expect(find.byType(shad.TextField), findsNothing);
      expect(
        find.widgetWithText(shad.PrimaryButton, 'Create account'),
        findsNothing,
      );
    });

    testWidgets('renders localized Apple auth errors', (tester) async {
      final state = const AuthState.unauthenticated().copyWith(
        errorCode: AuthErrorCode.appleBrowserLaunchFailed,
      );
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider.value(value: authCubit, child: const SignUpPage()),
      );
      await tester.pump();

      expect(
        find.text('Unable to open Apple sign-in right now.'),
        findsOneWidget,
      );
    });

    testWidgets('renders localized GitHub auth errors', (tester) async {
      final state = const AuthState.unauthenticated().copyWith(
        errorCode: AuthErrorCode.githubBrowserLaunchFailed,
      );
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider.value(value: authCubit, child: const SignUpPage()),
      );
      await tester.pump();

      expect(
        find.text('Unable to open GitHub sign-in right now.'),
        findsOneWidget,
      );
    });

    testWidgets('rebuilds when only auth errorCode changes', (tester) async {
      const initialState = AuthState.unauthenticated();
      final errorState = const AuthState.unauthenticated().copyWith(
        errorCode: AuthErrorCode.googleBrowserLaunchFailed,
      );
      when(() => authCubit.state).thenReturn(initialState);
      whenListen(
        authCubit,
        Stream<AuthState>.fromIterable([errorState]),
        initialState: initialState,
      );

      await tester.pumpApp(
        BlocProvider.value(value: authCubit, child: const SignUpPage()),
      );
      await tester.pump();

      expect(
        find.text('Unable to open Google sign-in right now.'),
        findsOneWidget,
      );
    });
  });
}
