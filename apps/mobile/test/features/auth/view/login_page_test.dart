import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/mobile_version_check.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/app_version/cubit/app_version_state.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/login_page.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockAppVersionCubit extends MockCubit<AppVersionState>
    implements AppVersionCubit {}

void main() {
  group('LoginPage', () {
    late AuthCubit authCubit;
    late AppVersionCubit appVersionCubit;

    Widget buildSubject() {
      return MultiBlocProvider(
        providers: [
          BlocProvider.value(value: authCubit),
          BlocProvider.value(value: appVersionCubit),
        ],
        child: const LoginPage(),
      );
    }

    setUp(() {
      authCubit = _MockAuthCubit();
      appVersionCubit = _MockAppVersionCubit();

      when(() => authCubit.clearError()).thenReturn(null);
      when(
        () => authCubit.setAddAccountFlow(enabled: any(named: 'enabled')),
      ).thenReturn(null);
      when(
        () => authCubit.cancelAddAccountFlow(),
      ).thenAnswer((_) async => true);
      when(() => authCubit.signInWithApple()).thenAnswer((_) async {});
      when(() => authCubit.signInWithGoogle()).thenAnswer((_) async {});
      when(() => authCubit.signInWithMicrosoft()).thenAnswer((_) async {});
      when(() => authCubit.signInWithGithub()).thenAnswer((_) async {});

      when(() => appVersionCubit.state).thenReturn(const AppVersionState());
      whenListen(
        appVersionCubit,
        const Stream<AppVersionState>.empty(),
        initialState: const AppVersionState(),
      );
    });

    testWidgets('renders all web-parity social buttons', (tester) async {
      const state = AuthState.unauthenticated();
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );
      const passwordOnlyState = AppVersionState(
        status: AppVersionGateStatus.supported,
        hasCompletedInitialCheck: true,
      );
      when(() => appVersionCubit.state).thenReturn(passwordOnlyState);
      whenListen(
        appVersionCubit,
        const Stream<AppVersionState>.empty(),
        initialState: passwordOnlyState,
      );

      await tester.pumpApp(buildSubject());
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

    testWidgets('shows add-account copy in add-account mode', (tester) async {
      const state = AuthState.unauthenticated();
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider.value(value: authCubit),
            BlocProvider.value(value: appVersionCubit),
          ],
          child: const LoginPage(addAccountMode: true),
        ),
      );
      await tester.pump();

      expect(find.text('Add another account'), findsOneWidget);
      expect(
        find.text("You're adding another account to this device."),
        findsOneWidget,
      );
      verify(() => authCubit.setAddAccountFlow(enabled: true)).called(1);
    });

    testWidgets('disables social buttons while auth is busy', (tester) async {
      final state = const AuthState.unauthenticated().copyWith(isLoading: true);
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(buildSubject());
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
      const passwordOnlyState = AppVersionState(
        status: AppVersionGateStatus.supported,
        hasCompletedInitialCheck: true,
      );
      when(() => appVersionCubit.state).thenReturn(passwordOnlyState);
      whenListen(
        appVersionCubit,
        const Stream<AppVersionState>.empty(),
        initialState: passwordOnlyState,
      );

      await tester.pumpApp(buildSubject());
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

      await tester.pumpApp(buildSubject());
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

      await tester.pumpApp(buildSubject());
      await tester.pump();

      expect(
        find.text('Unable to open Microsoft sign-in right now.'),
        findsOneWidget,
      );
    });

    testWidgets('shows single continue button while OTP mode is unresolved', (
      tester,
    ) async {
      const state = AuthState.unauthenticated();
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(buildSubject());
      await tester.pump();

      expect(find.text('Continue with email'), findsNothing);
      expect(find.text('Use password instead'), findsNothing);

      await tester.enterText(
        find.byType(shad.TextField).first,
        'user@test.com',
      );
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump(const Duration(milliseconds: 300));

      verifyNever(
        () =>
            authCubit.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
      );
    });

    testWidgets('uses the same OTP-first identify step as web when enabled', (
      tester,
    ) async {
      const state = AuthState.unauthenticated();
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );

      const otpEnabledState = AppVersionState(
        status: AppVersionGateStatus.supported,
        hasCompletedInitialCheck: true,
        versionCheck: MobileVersionCheck(
          platform: 'ios',
          currentVersion: '1.2.3',
          otpEnabled: true,
          status: MobileUpdateStatus.supported,
          shouldUpdate: false,
          requiresUpdate: false,
        ),
      );
      when(() => appVersionCubit.state).thenReturn(otpEnabledState);
      whenListen(
        appVersionCubit,
        const Stream<AppVersionState>.empty(),
        initialState: otpEnabledState,
      );

      await tester.pumpApp(buildSubject());
      await tester.pump();

      expect(
        find.widgetWithText(shad.PrimaryButton, 'Continue with email'),
        findsOneWidget,
      );
      expect(find.text('Use password instead'), findsNothing);
    });

    testWidgets(
      'opens OTP step on rate-limited OTP send so password fallback remains '
      'available',
      (
        tester,
      ) async {
        const state = AuthState.unauthenticated();
        when(() => authCubit.state).thenReturn(state);
        whenListen(
          authCubit,
          const Stream<AuthState>.empty(),
          initialState: state,
        );

        const otpEnabledState = AppVersionState(
          status: AppVersionGateStatus.supported,
          hasCompletedInitialCheck: true,
          versionCheck: MobileVersionCheck(
            platform: 'ios',
            currentVersion: '1.2.3',
            otpEnabled: true,
            status: MobileUpdateStatus.supported,
            shouldUpdate: false,
            requiresUpdate: false,
          ),
        );
        when(() => appVersionCubit.state).thenReturn(otpEnabledState);
        whenListen(
          appVersionCubit,
          const Stream<AppVersionState>.empty(),
          initialState: otpEnabledState,
        );
        when(
          () => authCubit.sendOtp(
            any(),
            captchaToken: any(named: 'captchaToken'),
          ),
        ).thenAnswer((_) async => (success: false, retryAfter: 30));

        await tester.pumpApp(buildSubject());
        await tester.pump();

        await tester.enterText(
          find.byType(shad.TextField).first,
          'user@test.com',
        );
        await tester.tap(
          find.widgetWithText(shad.PrimaryButton, 'Continue with email'),
        );
        await tester.pumpAndSettle();

        expect(
          find.text(
            'Enter your code below, or use password instead. Retry in 30s.',
          ),
          findsOneWidget,
        );
        expect(find.text('Use password instead'), findsOneWidget);
        expect(find.text('Retry in 30s'), findsOneWidget);
        expect(
          find.text('Too many OTP requests. Please try again later.'),
          findsNothing,
        );
      },
    );

    testWidgets(
      'clears stale OTP send errors when switching to password step',
      (
        tester,
      ) async {
        const initialState = AuthState.unauthenticated();
        final otpRateLimitState = const AuthState.unauthenticated().copyWith(
          error: 'Too many OTP requests. Please try again later.',
        );
        when(() => authCubit.state).thenReturn(initialState);
        whenListen(
          authCubit,
          Stream<AuthState>.fromIterable([otpRateLimitState]),
          initialState: initialState,
        );

        const otpEnabledState = AppVersionState(
          status: AppVersionGateStatus.supported,
          hasCompletedInitialCheck: true,
          versionCheck: MobileVersionCheck(
            platform: 'ios',
            currentVersion: '1.2.3',
            otpEnabled: true,
            status: MobileUpdateStatus.supported,
            shouldUpdate: false,
            requiresUpdate: false,
          ),
        );
        when(() => appVersionCubit.state).thenReturn(otpEnabledState);
        whenListen(
          appVersionCubit,
          const Stream<AppVersionState>.empty(),
          initialState: otpEnabledState,
        );
        when(
          () => authCubit.sendOtp(
            any(),
            captchaToken: any(named: 'captchaToken'),
          ),
        ).thenAnswer((_) async => (success: false, retryAfter: 30));

        await tester.pumpApp(buildSubject());
        await tester.pump();

        await tester.enterText(
          find.byType(shad.TextField).first,
          'user@test.com',
        );
        await tester.tap(
          find.widgetWithText(shad.PrimaryButton, 'Continue with email'),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Use password instead'));
        await tester.pumpAndSettle();

        verify(() => authCubit.clearError()).called(greaterThanOrEqualTo(1));
        expect(
          find.text('Too many OTP requests. Please try again later.'),
          findsNothing,
        );
      },
    );
  });
}
