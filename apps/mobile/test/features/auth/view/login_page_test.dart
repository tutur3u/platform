import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/mobile_version_check.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/app_version/cubit/app_version_state.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/login_page.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockAppVersionCubit extends MockCubit<AppVersionState>
    implements AppVersionCubit {}

void main() {
  group('LoginPage', () {
    const androidBackChannel = MethodChannel('mobile/shell_back');
    late AuthCubit authCubit;
    late AppVersionCubit appVersionCubit;
    late List<MethodCall> androidBackCalls;

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
      androidBackCalls = <MethodCall>[];

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(androidBackChannel, (call) async {
            androidBackCalls.add(call);
            return null;
          });

      when(() => authCubit.clearError()).thenReturn(null);
      when(
        () => authCubit.setAddAccountFlow(enabled: any(named: 'enabled')),
      ).thenReturn(null);
      when(
        () => authCubit.cancelAddAccountFlow(),
      ).thenAnswer((_) async => true);
      when(() => authCubit.signInWithApple()).thenAnswer((_) async {});
      when(() => authCubit.signInWithGoogle()).thenAnswer((_) async {});
      when(() => authCubit.signInWithGithub()).thenAnswer((_) async {});

      when(() => appVersionCubit.state).thenReturn(const AppVersionState());
      whenListen(
        appVersionCubit,
        const Stream<AppVersionState>.empty(),
        initialState: const AppVersionState(),
      );
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(androidBackChannel, null);
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
      expect(find.text('Continue with Microsoft'), findsNothing);
      // The test platform is Android: Apple signs in only on iOS.
      expect(find.byTooltip('Continue with Apple'), findsNothing);
      expect(find.byTooltip('Continue with GitHub'), findsOneWidget);
      expect(find.byTooltip('Sign in with mobile QR'), findsOneWidget);
      expect(find.text('Welcome to Tuturuuu'), findsOneWidget);
      expect(find.text('Sign in to continue'), findsNothing);
      expect(find.widgetWithText(AppButton, 'Continue'), findsOneWidget);
    });

    testWidgets('shows Apple sign-in only on iOS', (tester) async {
      const state = AuthState.unauthenticated();
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );
      for (final platform in TargetPlatform.values) {
        debugDefaultTargetPlatformOverride = platform;
        try {
          await tester.pumpApp(buildSubject());
          await tester.pump();
          expect(
            find.byTooltip('Continue with Apple'),
            platform == TargetPlatform.iOS ? findsOneWidget : findsNothing,
            reason: platform.name,
          );
          expect(find.byTooltip('Continue with GitHub'), findsOneWidget);
          if (platform == TargetPlatform.iOS) {
            await tester.ensureVisible(find.byTooltip('Continue with Apple'));
            await tester.tap(find.byTooltip('Continue with Apple'));
            await tester.pump();
            verify(() => authCubit.signInWithApple()).called(1);
          }
        } finally {
          debugDefaultTargetPlatformOverride = null;
        }
      }
    });

    testWidgets('footer asks only for the terms, not email consent', (
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

      final footer = tester.widget<Text>(
        find.byKey(const ValueKey('auth-legal-footer')),
      );
      expect(
        footer.textSpan!.toPlainText(),
        'By continuing you agree to the Terms and Privacy Policy.',
      );
      expect(find.textContaining('email', findRichText: true), findsNothing);
      expect(find.textContaining('updates', findRichText: true), findsNothing);
      expect(find.byType(Checkbox), findsNothing);
      expect(find.byType(Switch), findsNothing);
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

      expect(find.text('Add account'), findsOneWidget);
      expect(
        find.text("You're adding another account to this device."),
        findsOneWidget,
      );
      verify(() => authCubit.setAddAccountFlow(enabled: true)).called(1);
    });

    testWidgets('reports add-account route to Android back channel', (
      tester,
    ) async {
      final previousPlatformOverride = debugDefaultTargetPlatformOverride;
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      try {
        final binding = TestWidgetsFlutterBinding.ensureInitialized();

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
        await binding.runAsync(() async {
          await Future<void>.delayed(Duration.zero);
        });

        final updateCalls = androidBackCalls.where(
          (call) => call.method == 'updateState',
        );
        expect(updateCalls, isNotEmpty);
        expect(
          updateCalls.last.arguments,
          containsPair('route', '/add-account'),
        );
      } finally {
        debugDefaultTargetPlatformOverride = previousPlatformOverride;
      }
    });

    testWidgets('disables alternate auth buttons while auth is busy', (
      tester,
    ) async {
      final state = const AuthState.unauthenticated().copyWith(isLoading: true);
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(buildSubject());
      await tester.pump();

      final providers = [
        find.widgetWithText(AppButton, 'Continue with Google'),
        find.byTooltip('Continue with GitHub'),
        find.byTooltip('Sign in with mobile QR'),
      ];
      for (final button in providers) {
        expect(button, findsOneWidget);
        await tester.ensureVisible(button);
        await tester.tap(button, warnIfMissed: false);
      }
      verifyNever(() => authCubit.signInWithApple());
      verifyNever(() => authCubit.signInWithGoogle());
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

      await tester.enterText(find.byType(TextField).first, 'user@test.com');
      await tester.ensureVisible(find.widgetWithText(AppButton, 'Continue'));
      await tester.tap(find.widgetWithText(AppButton, 'Continue'));
      await tester.pumpAndSettle();

      expect(find.text('Other ways to sign in'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(find.widgetWithText(AppButton, 'Continue'), findsNothing);
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

      // One Continue button, waiting while the OTP policy resolves.
      expect(
        tester
            .widget<AppButton>(find.widgetWithText(AppButton, 'Continue'))
            .loading,
        isTrue,
      );
      expect(find.text('Use password'), findsNothing);

      await tester.enterText(find.byType(TextField).first, 'user@test.com');
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

      expect(find.widgetWithText(AppButton, 'Continue'), findsOneWidget);
      expect(find.text('Use password'), findsNothing);
    });

    testWidgets(
      'opens OTP step on rate-limited OTP send so password fallback remains '
      'available',
      (tester) async {
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

        await tester.enterText(find.byType(TextField).first, 'user@test.com');
        await tester.tap(find.widgetWithText(AppButton, 'Continue'));
        await tester.pumpAndSettle();

        expect(
          find.text(
            'Enter your code below, or use password instead. Retry in 30s.',
          ),
          findsOneWidget,
        );
        expect(find.text('Use password'), findsOneWidget);
        expect(find.text('Resend in 0:30'), findsOneWidget);
        expect(
          find.text('Too many OTP requests. Please try again later.'),
          findsNothing,
        );
      },
    );

    testWidgets(
      'clears stale OTP send errors when switching to password step',
      (tester) async {
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

        await tester.enterText(find.byType(TextField).first, 'user@test.com');
        await tester.tap(find.widgetWithText(AppButton, 'Continue'));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Use password'));
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
