import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/models/mobile_version_check.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/app_version/cubit/app_version_state.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/login_page.dart';
import 'package:mobile/features/auth/view/mfa_verify_page.dart';
import 'package:mobile/features/auth/widgets/security_check_dialog.dart';
import 'package:mobile/features/shell/view/account_switcher_sheet.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/pump_app.dart';

/// Design review renders of the sign-in flow on Sorbet. PNGs are written
/// only with `DESIGN_RENDER_DIR` set; otherwise each case is a smoke test
/// that the screen lays out without overflow at phone and tablet widths.
class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Version extends MockCubit<AppVersionState> implements AppVersionCubit {}

const _otpOn = AppVersionState(
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

const _user = User(
  id: 'active',
  email: 'lan.nguyen@example.test',
  appMetadata: {},
  userMetadata: {'display_name': 'Lan Nguyen'},
  aud: 'authenticated',
  createdAt: '',
);

final AuthState _signedIn = const AuthState.authenticated(_user).copyWith(
  switchingAccountId: 'lab',
  expiredAccountIds: const {'minh'},
  accounts: const [
    StoredAuthAccount(
      id: 'lab',
      refreshToken: '',
      lastActiveAt: 3,
      addedAt: 1,
      displayName: 'Lan at Lotus Lab',
      email: 'lan@lotuslab.example.test',
    ),
    StoredAuthAccount(
      id: 'minh',
      refreshToken: '',
      lastActiveAt: 2,
      addedAt: 1,
      displayName: 'Minh Tran',
      email: 'minh@example.test',
    ),
  ],
);

enum _Screen { login, otp, mfa, securityCheck, accountSwitcher }

void main() {
  late _Auth auth;
  late _Version version;

  setUpAll(() async {
    if (DesignRender.outputDir != null) {
      // Code cells use the Sorbet mono face.
      await (FontLoader('JetBrainsMono')..addFont(
            rootBundle.load('assets/fonts/JetBrainsMono-Variable.ttf'),
          ))
          .load();
    }
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          (_) async => null,
        );
  });

  setUp(() {
    auth = _Auth();
    version = _Version();
    when(() => version.state).thenReturn(_otpOn);
    whenListen(
      version,
      const Stream<AppVersionState>.empty(),
      initialState: _otpOn,
    );
    when(auth.clearError).thenReturn(null);
    when(() => auth.isClosed).thenReturn(false);
    when(auth.syncCurrentSessionToStore).thenAnswer((_) async {});
    when(
      () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
    ).thenAnswer((_) async => (success: true, retryAfter: 42));
  });

  void signedOut() {
    const state = AuthState.unauthenticated();
    when(() => auth.state).thenReturn(state);
    whenListen(auth, const Stream<AuthState>.empty(), initialState: state);
  }

  Widget host(Widget page, Brightness brightness, Locale locale) =>
      sorbetTestApp(
        sorbet: const SorbetTheme(),
        brightness: brightness,
        boundaryKey: DesignRenderApp.boundaryKey,
        locale: locale,
        home: Builder(
          builder: (context) => Localizations.override(
            context: context,
            locale: locale,
            child: MultiBlocProvider(
              providers: [
                BlocProvider<AuthCubit>.value(value: auth),
                BlocProvider<AppVersionCubit>.value(value: version),
              ],
              child: page,
            ),
          ),
        ),
      );

  Future<void> showOtpStep(WidgetTester tester) async {
    await tester.enterText(find.byType(TextField).first, 'lan@example.test');
    await tester.pump();
    final next = find.text(
      Localizations.localeOf(tester.element(find.byType(LoginPage))) ==
              const Locale('vi')
          ? 'Tiếp tục'
          : 'Continue',
    );
    await tester.ensureVisible(next);
    await tester.tap(next);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('auth-otp-input')),
      '4820',
    );
    await tester.pump();
  }

  Future<void> render(
    WidgetTester tester,
    _Screen screen,
    Brightness brightness,
    Locale locale,
  ) async {
    switch (screen) {
      case _Screen.login || _Screen.otp || _Screen.securityCheck:
        signedOut();
        await tester.pumpWidget(host(const LoginPage(), brightness, locale));
        await tester.pump();
        if (screen == _Screen.otp) await showOtpStep(tester);
        if (screen == _Screen.securityCheck) {
          final context = tester.element(find.byType(LoginPage));
          unawaited(
            showSecurityCheckPanel(
              Navigator.of(context, rootNavigator: true),
              modal: true,
              challengeBuilder: (key, onToken, onFailure) =>
                  const SizedBox(height: 65),
            ),
          );
          await tester.pumpAndSettle();
        }
      case _Screen.mfa:
        signedOut();
        await tester.pumpWidget(
          host(const MfaVerifyPage(), brightness, locale),
        );
        await tester.pumpAndSettle();
      case _Screen.accountSwitcher:
        when(() => auth.state).thenReturn(_signedIn);
        whenListen(
          auth,
          const Stream<AuthState>.empty(),
          initialState: _signedIn,
        );
        await tester.pumpWidget(
          host(
            Builder(
              builder: (context) => Scaffold(
                body: Center(
                  child: TextButton(
                    onPressed: () => showAccountSwitcherSheet(context),
                    child: const Text('Accounts'),
                  ),
                ),
              ),
            ),
            brightness,
            locale,
          ),
        );
        await tester.tap(find.text('Accounts'));
        // The switching row spins, so settle by time.
        await tester.pump();
        await tester.pump(const Duration(seconds: 1));
    }
  }

  const locales = {'en': Locale('en'), 'vi': Locale('vi')};
  for (final screen in _Screen.values) {
    for (final size in ['phone', 'tablet']) {
      for (final brightness in Brightness.values) {
        for (final MapEntry(key: lang, value: locale) in locales.entries) {
          // Vietnamese is rendered on phones, where long copy is tightest.
          if (lang == 'vi' && size == 'tablet') continue;
          final name = '${screen.name}-$size-${brightness.name}-$lang';
          testWidgets('renders $name', (tester) async {
            await DesignRender.loadFonts();
            DesignRender.setSize(tester, DesignRender.sizes[size]!);
            await render(tester, screen, brightness, locale);
            expect(tester.takeException(), isNull);
            await DesignRender.capture(tester, 'auth-sorbet/$name');
          });
        }
      }
    }
  }
}
