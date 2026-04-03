import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/login_page.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

void main() {
  group('LoginPage', () {
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
        BlocProvider.value(value: authCubit, child: const LoginPage()),
      );
      await tester.pump();

      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('Continue with Microsoft'), findsOneWidget);
      expect(find.text('Continue with Apple'), findsOneWidget);
      expect(find.text('Continue with GitHub'), findsOneWidget);
      expect(find.text('Sign in to continue'), findsNothing);
      expect(
        find.widgetWithText(shad.PrimaryButton, 'Continue with email'),
        findsOneWidget,
      );
    });

    testWidgets('disables social buttons while auth is busy', (
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

      expect(find.text('Continue with Apple'), findsNothing);
      expect(find.text('Continue with Google'), findsNothing);
      expect(find.text('Continue with Microsoft'), findsNothing);
      expect(find.text('Continue with GitHub'), findsNothing);
      expect(find.byType(shad.OutlineButton), findsNWidgets(4));

      for (var index = 0; index < 4; index++) {
        final button = find.byType(shad.OutlineButton).at(index);
        await tester.ensureVisible(button);
        await tester.tap(button, warnIfMissed: false);
      }
      verifyNever(() => authCubit.signInWithApple());
      verifyNever(() => authCubit.signInWithGoogle());
      verifyNever(() => authCubit.signInWithMicrosoft());
      verifyNever(() => authCubit.signInWithGithub());
    });

    testWidgets('switches to password step after confirming email', (
      tester,
    ) async {
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

      await tester.enterText(
        find.byType(shad.TextField).first,
        'user@test.com',
      );
      await tester.ensureVisible(
        find.widgetWithText(shad.PrimaryButton, 'Continue with email'),
      );
      await tester.tap(
        find.widgetWithText(shad.PrimaryButton, 'Continue with email'),
      );
      await tester.pumpAndSettle();

      expect(find.text('Back'), findsOneWidget);
      expect(find.byType(shad.TextField), findsOneWidget);
      expect(
        find.widgetWithText(shad.PrimaryButton, 'Continue with email'),
        findsNothing,
      );
      expect(find.text('Continue with Google'), findsNothing);
      expect(find.text('Continue with Microsoft'), findsNothing);
      expect(find.text('Continue with Apple'), findsNothing);
      expect(find.text('Continue with GitHub'), findsNothing);
    });

    testWidgets('rebuilds to show localized auth errors from errorCode', (
      tester,
    ) async {
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
        BlocProvider.value(value: authCubit, child: const LoginPage()),
      );
      await tester.pump();

      expect(
        find.text('Unable to open Google sign-in right now.'),
        findsOneWidget,
      );
    });

    testWidgets('rebuilds to show localized Microsoft auth errors', (
      tester,
    ) async {
      const initialState = AuthState.unauthenticated();
      final errorState = const AuthState.unauthenticated().copyWith(
        errorCode: AuthErrorCode.microsoftBrowserLaunchFailed,
      );
      when(() => authCubit.state).thenReturn(initialState);
      whenListen(
        authCubit,
        Stream<AuthState>.fromIterable([errorState]),
        initialState: initialState,
      );

      await tester.pumpApp(
        BlocProvider.value(value: authCubit, child: const LoginPage()),
      );
      await tester.pump();

      expect(
        find.text('Unable to open Microsoft sign-in right now.'),
        findsOneWidget,
      );
    });
  });
}
