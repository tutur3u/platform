// Local end-to-end flow against a seeded local backend (scripts/thanh-e2e).
//
// Run through `node scripts/thanh-e2e/thanh-e2e.mjs mobile-e2e <ios|android>`,
// which supplies loopback dart-defines and collects screenshots.
import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/settings/view/timezone_settings_tile.dart';
import 'package:mobile/main_development.dart' as app;

const _email = String.fromEnvironment(
  'E2E_EMAIL',
  defaultValue: 'local@tuturuuu.com',
);
// Public local-only seed password from apps/database/supabase/seed.sql.
const _password = String.fromEnvironment(
  'E2E_PASSWORD',
  defaultValue: 'password123',
);
const _timezone = String.fromEnvironment(
  'E2E_TIMEZONE',
  defaultValue: 'Asia/Ho_Chi_Minh',
);

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // The host runner (scripts/thanh-e2e) captures a device screenshot when it
  // sees this marker; holding the frame works in debug, profile and release.
  Future<void> shot(WidgetTester tester, String name) async {
    await tester.pump();
    debugPrint('E2E_SHOT ${Platform.isAndroid ? 'android' : 'ios'}-$name');
    await _settle(tester, seconds: 3);
  }

  testWidgets('login, agenda, settings and timezone flow', (tester) async {
    // bootstrap() installs the app's FlutterError.onError; restore the test
    // binding's handler so framework errors fail the test with their details.
    final testErrorHandler = FlutterError.onError;
    await app.main();
    FlutterError.onError = testErrorHandler;
    await _pumpUntil(
      tester,
      () =>
          _authStatus(tester) == AuthStatus.authenticated ||
          find.text('Continue with email').evaluate().isNotEmpty,
      timeout: const Duration(seconds: 60),
    );
    await _settle(tester);
    await shot(tester, '01-launch');

    if (_authStatus(tester) != AuthStatus.authenticated) {
      await tester.enterText(find.byType(EditableText).first, _email);
      // Continue is a no-op while OTP availability resolves (short grace
      // period), so retry the tap until the password stage renders.
      await _pumpUntil(tester, () {
        if (find.text('Sign in').evaluate().isNotEmpty) return true;
        final cont = find.text('Continue with email');
        if (cont.evaluate().isNotEmpty) {
          unawaited(tester.tap(cont.first, warnIfMissed: false));
        }
        return false;
      }, step: const Duration(seconds: 1));
      await tester.enterText(find.byType(EditableText).last, _password);
      await shot(tester, '02-password');
      await tester.tap(find.text('Sign in').last);
      await _pumpUntil(
        tester,
        () => _authStatus(tester) == AuthStatus.authenticated,
        timeout: const Duration(seconds: 90),
      );
    }
    await _settle(tester);
    await shot(tester, '03-signed-in');
    _expectNoErrorWidget('after sign-in');

    _router(tester).go(Routes.calendar);
    await _settle(tester);
    final agendaControl = _firstPresent([
      find.byIcon(Icons.view_agenda_outlined),
      find.bySemanticsLabel('Agenda'),
      find.text('Agenda'),
    ]);
    if (agendaControl != null) {
      await tester.tap(agendaControl.first);
      await _settle(tester);
    }
    await _pumpUntil(
      tester,
      () => find.byType(AgendaView).evaluate().isNotEmpty,
      timeout: const Duration(seconds: 45),
    );
    await _settle(tester);
    await shot(tester, '04-agenda');
    _expectNoErrorWidget('on Agenda');

    _router(tester).go(Routes.settingsPreferences);
    await _settle(tester);
    final tile = find.byType(TimezoneSettingsTile);
    await _pumpUntil(tester, () => tile.evaluate().isNotEmpty);
    await tester.scrollUntilVisible(
      tile,
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await _settle(tester);
    await shot(tester, '05-settings-preferences');
    _expectNoErrorWidget('on Settings');

    await tester.tap(
      find.descendant(of: tile, matching: find.byType(InkWell)).first,
    );
    await _settle(tester);
    await tester.enterText(find.byType(EditableText).last, _timezone);
    await _settle(tester);
    await shot(tester, '06-timezone-search');
    final option = find.byKey(const ValueKey('timezone-option-$_timezone'));
    await _pumpUntil(tester, () => option.evaluate().isNotEmpty);
    await tester.tap(option.first);
    await _settle(tester, seconds: 4);
    await shot(tester, '07-timezone-saved');
    _expectNoErrorWidget('after timezone change');

    _router(tester).go(Routes.calendar);
    await _settle(tester, seconds: 4);
    await _pumpUntil(
      tester,
      () => find.byType(AgendaView).evaluate().isNotEmpty,
      timeout: const Duration(seconds: 45),
    );
    await shot(tester, '08-agenda-after-timezone');
    _expectNoErrorWidget('on Agenda after timezone change');
  });
}

Finder? _firstPresent(List<Finder> finders) {
  for (final finder in finders) {
    if (finder.evaluate().isNotEmpty) return finder;
  }
  return null;
}

AuthStatus? _authStatus(WidgetTester tester) {
  final navigators = find.byType(Navigator).evaluate();
  if (navigators.isEmpty) return null;
  return navigators.last.read<AuthCubit>().state.status;
}

GoRouter _router(WidgetTester tester) =>
    GoRouter.of(tester.element(find.byType(Navigator).last));

void _expectNoErrorWidget(String where) {
  expect(
    find.byType(ErrorWidget),
    findsNothing,
    reason: 'ErrorWidget (gray screen in release) rendered $where',
  );
}

Future<void> _settle(WidgetTester tester, {int seconds = 2}) async {
  final end = DateTime.now().add(Duration(seconds: seconds));
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _pumpUntil(
  WidgetTester tester,
  bool Function() condition, {
  Duration timeout = const Duration(seconds: 30),
  Duration step = const Duration(milliseconds: 200),
}) async {
  final end = DateTime.now().add(timeout);
  while (!condition()) {
    if (DateTime.now().isAfter(end)) {
      throw TestFailure('Timed out after ${timeout.inSeconds}s');
    }
    await tester.pump(step);
  }
}
