import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/mobile_version_check.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/app_version/cubit/app_version_state.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/login_page.dart';
import 'package:mobile/features/auth/view/mfa_verify_page.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

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

/// The smallest supported phone at double text, keyboard optionally up.
Widget _small(Widget child, {double keyboard = 0}) => Builder(
  builder: (context) => MediaQuery(
    data: MediaQuery.of(context).copyWith(
      textScaler: const TextScaler.linear(2),
      viewInsets: EdgeInsets.only(bottom: keyboard),
    ),
    child: child,
  ),
);

void _expectTappable(WidgetTester tester, Finder button, double bottom) {
  expect(button, findsOneWidget);
  final rect = tester.getRect(button);
  expect(rect.top, greaterThanOrEqualTo(0));
  expect(rect.bottom, lessThanOrEqualTo(bottom));
  expect(rect.height, greaterThanOrEqualTo(44));
  expect(tester.takeException(), isNull);
}

void main() {
  late _Auth auth;
  late _Version version;

  setUp(() {
    auth = _Auth();
    version = _Version();
    const state = AuthState.unauthenticated();
    when(() => auth.state).thenReturn(state);
    whenListen(auth, const Stream<AuthState>.empty(), initialState: state);
    when(() => version.state).thenReturn(_otpOn);
    whenListen(
      version,
      const Stream<AppVersionState>.empty(),
      initialState: _otpOn,
    );
    when(auth.clearError).thenReturn(null);
    when(
      () => auth.sendOtp(any(), captchaToken: any(named: 'captchaToken')),
    ).thenAnswer((_) async => (success: true, retryAfter: null));
    when(() => auth.verifyMfa(any())).thenAnswer((_) async => true);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          (_) async => null,
        );
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            const MethodChannel('mobile/shell_back'),
            null,
          ),
    );
  });

  void useSmallPhone(WidgetTester tester) {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(320, 568);
    addTearDown(tester.view.reset);
  }

  Widget login({double keyboard = 0}) => _small(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<AppVersionCubit>.value(value: version),
      ],
      child: const LoginPage(),
    ),
    keyboard: keyboard,
  );

  testWidgets('Continue is reachable at 320x568 with double text', (
    tester,
  ) async {
    useSmallPhone(tester);
    await tester.pumpApp(login());
    await tester.pump();
    final continueButton = find.widgetWithText(AppButton, 'Continue');
    await tester.ensureVisible(continueButton);
    await tester.pumpAndSettle();
    _expectTappable(tester, continueButton, 568);
  });

  testWidgets('Verify stays above the keyboard on the code step', (
    tester,
  ) async {
    useSmallPhone(tester);
    await tester.pumpApp(login());
    await tester.pump();
    await tester.enterText(find.byType(TextField).first, 'a@example.test');
    await tester.pump();
    final continueButton = find.widgetWithText(AppButton, 'Continue');
    await tester.ensureVisible(continueButton);
    await tester.tap(continueButton);
    await tester.pumpAndSettle();
    expect(find.text('Check your email'), findsOneWidget);

    await tester.pumpApp(login(keyboard: 260));
    await tester.pump();
    // pumpApp rebuilt the page; walk back to the code step.
    await tester.enterText(find.byType(TextField).first, 'a@example.test');
    await tester.pump();
    await tester.ensureVisible(continueButton);
    await tester.tap(continueButton);
    await tester.pumpAndSettle();
    _expectTappable(
      tester,
      find.widgetWithText(AppButton, 'Verify code'),
      568 - 260,
    );
  });

  testWidgets('two-step Verify is reachable at 320x568 with double text', (
    tester,
  ) async {
    useSmallPhone(tester);
    await tester.pumpApp(
      _small(
        BlocProvider<AuthCubit>.value(
          value: auth,
          child: const MfaVerifyPage(),
        ),
      ),
    );
    await tester.pump();
    final verify = find.widgetWithText(AppButton, 'Verify');
    await tester.ensureVisible(verify);
    await tester.pumpAndSettle();
    _expectTappable(tester, verify, 568);
    expect(find.text('Two-step verification'), findsOneWidget);
  });
}
