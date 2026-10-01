import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/models/mobile_version_check.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/app_version/cubit/app_version_state.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/login_page.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Version extends MockCubit<AppVersionState> implements AppVersionCubit {}

void main() {
  group('Configured OTP CAPTCHA guards', () {
    late AuthCubit auth;
    late AppVersionCubit version;

    setUp(() {
      expect(
        Env.isTurnstileConfigured,
        isTrue,
        reason:
            'Run with synthetic TURNSTILE_SITE_KEY and '
            'TURNSTILE_BASE_URL defines.',
      );
      auth = _Auth();
      version = _Version();
      whenListen(
        auth,
        const Stream<AuthState>.empty(),
        initialState: const AuthState.unauthenticated(),
      );
      whenListen(
        version,
        const Stream<AppVersionState>.empty(),
        initialState: const AppVersionState(
          hasCompletedInitialCheck: true,
          status: AppVersionGateStatus.supported,
          versionCheck: MobileVersionCheck(
            platform: 'ios',
            currentVersion: '1.2.3',
            otpEnabled: true,
            status: MobileUpdateStatus.supported,
            shouldUpdate: false,
            requiresUpdate: false,
          ),
        ),
      );
      when(() => auth.clearError()).thenReturn(null);
      when(
        () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
      ).thenAnswer((_) async => (success: true, retryAfter: null));
    });

    Future<void> tap(WidgetTester tester, String text) async {
      await tester.ensureVisible(find.text(text));
      await tester.tap(find.text(text));
      await tester.pumpAndSettle();
    }

    Future<void> render(
      WidgetTester tester,
      String email,
      Future<String?> Function(BuildContext) check,
    ) async {
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider.value(value: auth),
            BlocProvider.value(value: version),
          ],
          child: LoginPage(otpSecurityCheck: check),
        ),
      );
      await tester.pump();
      await tester.enterText(find.byType(shad.TextField).first, email);
      await tap(tester, 'Continue with email');
      expect(find.text('Sign in'), findsOneWidget);
    }

    for (final domain in ['tuturuuu.com', 'tutur3u.com']) {
      testWidgets('cancelled CAPTCHA blocks initial code switch for $domain', (
        tester,
      ) async {
        var checks = 0;
        await render(tester, 'person@$domain', (_) async {
          checks++;
          return null;
        });
        await tap(tester, 'Use email code instead');
        expect(checks, 1);
        expect(find.text('Sign in'), findsOneWidget);
        expect(find.text('Verify code'), findsNothing);
        verifyNever(
          () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
        );
        await tap(tester, 'Back');
        // Explicit code preference survives cancellation; continuing requests a
        // fresh check, and the null-token guard still blocks the API action.
        await tap(tester, 'Continue with email');
        expect(checks, 2);
        expect(find.text('Verify code'), findsNothing);
        verifyNever(
          () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
        );
      });

      testWidgets(
        'each code switch forwards a fresh CAPTCHA token for $domain',
        (tester) async {
          var checks = 0;
          await render(
            tester,
            'person@$domain',
            (_) async => 'synthetic-${++checks}',
          );
          await tap(tester, 'Use email code instead');
          expect(find.text('Verify code'), findsOneWidget);
          verify(
            () => auth.sendOtp('person@$domain', captchaToken: 'synthetic-1'),
          ).called(1);
          await tap(tester, 'Use password instead');
          await tap(tester, 'Use email code instead');
          expect(find.text('Verify code'), findsOneWidget);
          expect(checks, 2);
          verify(
            () => auth.sendOtp('person@$domain', captchaToken: 'synthetic-2'),
          ).called(1);
        },
      );
    }
  }, skip: !Env.isTurnstileConfigured);
}
