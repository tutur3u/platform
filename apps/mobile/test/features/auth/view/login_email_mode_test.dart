import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
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

class _MockVersionCubit extends MockCubit<AppVersionState>
    implements AppVersionCubit {}

void main() {
  late AuthCubit auth;
  late AppVersionCubit version;

  const otpEnabled = AppVersionState(
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

  setUp(() {
    auth = _MockAuthCubit();
    version = _MockVersionCubit();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated(),
    );
    whenListen(
      version,
      const Stream<AppVersionState>.empty(),
      initialState: otpEnabled,
    );
    when(() => auth.clearError()).thenReturn(null);
    when(
      () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
    ).thenAnswer((_) async => (success: true, retryAfter: null));
    when(
      () => auth.signInWithPassword(
        any(),
        any(),
        captchaToken: any(named: 'captchaToken'),
      ),
    ).thenAnswer((_) async => false);
  });

  Future<void> render(WidgetTester tester) async {
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: auth),
          BlocProvider.value(value: version),
        ],
        child: const LoginPage(),
      ),
    );
    await tester.pump();
  }

  Future<void> tap(WidgetTester tester, String label) async {
    final button = find.text(label);
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
  }

  Future<void> identify(WidgetTester tester, String email) async {
    await tester.enterText(find.byType(shad.TextField).first, email);
    await tap(tester, 'Continue with email');
  }

  void expectPassword(WidgetTester tester) {
    expect(find.text('Sign in'), findsOneWidget);
    expect(
      tester
          .widget<shad.TextField>(find.byType(shad.TextField).first)
          .obscureText,
      isTrue,
    );
  }

  void expectOtp() {
    expect(find.text('Verify code'), findsOneWidget);
    expect(find.text('Use password instead'), findsOneWidget);
  }

  for (final email in [
    'person@tuturuuu.com',
    'person@tutur3u.com',
    ' Person@TUTURUUU.COM ',
    ' Person@TUTUR3U.COM ',
  ]) {
    testWidgets('prefers password for $email without a code request', (
      tester,
    ) async {
      await render(tester);
      await identify(tester, email);
      expectPassword(tester);
      expect(find.text('Use email code instead'), findsOneWidget);
      verifyNever(
        () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
      );
      await tap(tester, 'Back');
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('Sign in with mobile QR'), findsOneWidget);
    });
  }

  for (final email in [
    'person@example.com',
    'person@sub.tuturuuu.com',
    'person@tuturuuu.com.evil.test',
    'person@tutur3u.com.evil.test',
    'person@tutur3uu.com',
  ]) {
    testWidgets('keeps the external code default for $email', (tester) async {
      await render(tester);
      await identify(tester, email);
      expectOtp();
      verify(
        () => auth.sendOtp(email, captchaToken: any(named: 'captchaToken')),
      ).called(1);
    });
  }

  testWidgets('recomputes defaults for internal/external edits and back', (
    tester,
  ) async {
    await render(tester);
    for (final email in [
      'person@tuturuuu.com',
      'person@example.com',
      'person@tutur3u.com',
      'person@example.com',
      'person@tuturuuu.com',
    ]) {
      await identify(tester, email);
      if (email.endsWith('@example.com')) {
        expectOtp();
      } else {
        expectPassword(tester);
      }
      await tap(tester, 'Back');
    }
    verify(
      () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
    ).called(2);
  });

  for (final domain in ['tuturuuu.com', 'tutur3u.com']) {
    testWidgets('preserves explicit code for $domain through cooldown, '
        'back and email changes', (tester) async {
      await render(tester);
      await identify(tester, 'person@$domain');
      expectPassword(tester);
      await tap(tester, 'Use email code instead');
      expectOtp();
      when(
        () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
      ).thenAnswer((_) async => (success: false, retryAfter: 30));
      await tap(tester, 'Resend code');
      expect(find.text('Retry in 30s'), findsOneWidget);
      expectOtp();
      await tap(tester, 'Back');
      await identify(tester, 'another@tuturuuu.com');
      expectPassword(tester);
      await tap(tester, 'Back');
      await identify(tester, ' PERSON@${domain.toUpperCase()} ');
      expectOtp();
      verify(
        () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
      ).called(2);
    });
  }

  testWidgets(
    'preserves external password choice through sign-in retry and back',
    (tester) async {
      await render(tester);
      await identify(tester, 'person@example.com');
      expectOtp();
      await tap(tester, 'Use password instead');
      expectPassword(tester);
      await tester.enterText(
        find.byType(shad.TextField).first,
        'synthetic-password',
      );
      await tap(tester, 'Sign in');
      expectPassword(tester);
      await tap(tester, 'Sign in');
      verify(
        () => auth.signInWithPassword(
          'person@example.com',
          'synthetic-password',
          captchaToken: any(named: 'captchaToken'),
        ),
      ).called(2);
      await tap(tester, 'Back');
      await identify(tester, 'person@tutur3u.com');
      expectPassword(tester);
      await tap(tester, 'Back');
      await identify(tester, ' PERSON@EXAMPLE.COM ');
      expectPassword(tester);
      verify(
        () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
      ).called(1);
    },
  );

  testWidgets('uses password when OTP is disabled by existing policy', (
    tester,
  ) async {
    whenListen(
      version,
      const Stream<AppVersionState>.empty(),
      initialState: const AppVersionState(
        status: AppVersionGateStatus.supported,
        hasCompletedInitialCheck: true,
      ),
    );
    await render(tester);
    await identify(tester, 'person@example.com');
    expectPassword(tester);
    expect(find.text('Use email code instead'), findsNothing);
    verifyNever(
      () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
    );
  });
}
