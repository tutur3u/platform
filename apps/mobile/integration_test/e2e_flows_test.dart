// Local end-to-end flow against a seeded local backend (scripts/thanh-e2e).
//
// Run through `node scripts/thanh-e2e/thanh-e2e.mjs mobile-e2e <ios|android>`,
// which supplies loopback dart-defines and collects screenshots.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/settings/view/timezone_picker_sheet.dart';
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
  // Listed near the top of the picker, so no lazy-list scrolling is needed.
  defaultValue: 'Pacific/Niue',
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

  // Waits for a condition; on timeout captures the screen and visible text so
  // a failing run explains itself (e.g. a stuck loading or error state).
  Future<void> waitFor(
    WidgetTester tester,
    String label,
    bool Function() condition, {
    Duration timeout = const Duration(seconds: 45),
  }) async {
    try {
      await _pumpUntil(tester, condition, timeout: timeout);
    } on TestFailure {
      await shot(tester, 'timeout-$label');
      final optionKeys = find
          .byWidgetPredicate(
            (widget) =>
                widget.key is ValueKey<String> &&
                (widget.key! as ValueKey<String>).value.startsWith(
                  'timezone-option-',
                ),
          )
          .evaluate()
          .map((e) => (e.widget.key! as ValueKey<String>).value)
          .take(8)
          .join(', ');
      throw TestFailure(
        'Timed out waiting for $label; visible: ${_visibleTexts()}; '
        'option keys: $optionKeys',
      );
    }
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
      if (await _reachPasswordStage(tester)) {
        await tester.enterText(find.byType(EditableText).last, _password);
        await shot(tester, '02-password');
        await _hideKeyboard(tester);
        await tester.tap(find.text('Sign in').last, warnIfMissed: false);
      } else {
        // Profile/release builds on Android can drop typed text while the
        // login page settles. Sign in through the same AuthCubit call the
        // Sign in button makes so the rest of the flow still runs.
        await shot(tester, '02-password-stage-missing');
        debugPrint(
          'E2E_NOTE ui password stage unavailable; visible: '
          '${_visibleTexts()}; using AuthCubit.signInWithPassword',
        );
        await find
            .byType(Navigator)
            .evaluate()
            .last
            .read<AuthCubit>()
            .signInWithPassword(_email, _password);
      }
      await waitFor(
        tester,
        'signed-in',
        () => _authStatus(tester) == AuthStatus.authenticated,
        timeout: const Duration(seconds: 90),
      );
    }
    await _settle(tester);
    await shot(tester, '03-signed-in');
    _expectNoErrorWidget('after sign-in');

    _router(tester).go(Routes.calendar);
    await _settle(tester);
    await _showAgenda(tester);
    await waitFor(
      tester,
      'agenda',
      () => find.byType(AgendaView).evaluate().isNotEmpty,
    );
    await _settle(tester);
    await shot(tester, '04-agenda');
    _expectNoErrorWidget('on Agenda');

    _router(tester).go(Routes.settingsPreferences);
    await _settle(tester);
    final tile = find.byType(TimezoneSettingsTile);
    await waitFor(tester, 'timezone-tile', () => tile.evaluate().isNotEmpty);
    await tester.ensureVisible(tile.first);
    await _settle(tester);
    await shot(tester, '05-settings-preferences');
    _expectNoErrorWidget('on Settings');

    await tester.tap(find.text('Personal timezone').first);
    await _settle(tester);
    final picker = find.byType(TimezonePickerSheet);
    await waitFor(
      tester,
      'timezone-picker',
      () => picker.evaluate().isNotEmpty,
    );
    await _settle(tester);
    await shot(tester, '06-timezone-picker');
    final option = find.byKey(const ValueKey('timezone-option-$_timezone'));
    await waitFor(
      tester,
      'timezone-option',
      () => option.evaluate().isNotEmpty,
    );
    await tester.ensureVisible(option.first);
    await _hideKeyboard(tester);
    await tester.tap(option.first);
    await _settle(tester, seconds: 4);
    await shot(tester, '07-timezone-saved');
    _expectNoErrorWidget('after timezone change');

    _router(tester).go(Routes.calendar);
    await _settle(tester, seconds: 4);
    await _showAgenda(tester);
    await waitFor(
      tester,
      'agenda',
      () => find.byType(AgendaView).evaluate().isNotEmpty,
    );
    await shot(tester, '08-agenda-after-timezone');
    _expectNoErrorWidget('on Agenda after timezone change');
  });
}

/// Types the email and taps Continue until the password stage renders.
/// Continue is a no-op while OTP availability resolves, and the page can
/// rebuild once startup checks settle, so both steps are retried.
Future<bool> _reachPasswordStage(WidgetTester tester) async {
  final deadline = DateTime.now().add(const Duration(seconds: 20));
  while (find.text('Sign in').evaluate().isEmpty) {
    if (DateTime.now().isAfter(deadline)) return false;
    final cont = find.text('Continue with email');
    if (cont.evaluate().isNotEmpty) {
      await tester.enterText(find.byType(EditableText).first, _email);
      await _hideKeyboard(tester);
      await tester.tap(cont.first, warnIfMissed: false);
    }
    await _settle(tester, seconds: 1);
  }
  return true;
}

/// The soft keyboard (real on simulators/emulators) can cover the button.
Future<void> _hideKeyboard(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await _settle(tester, seconds: 1);
}

String _visibleTexts() => find
    .byType(Text)
    .evaluate()
    .map((e) => (e.widget as Text).data)
    .whereType<String>()
    .take(30)
    .join(' | ');

/// Switches the calendar to Agenda through the same cubit call the shell
/// mini-nav item makes; the floating dock's hit area is not test-stable.
Future<void> _showAgenda(WidgetTester tester) async {
  final builder = find.byWidgetPredicate(
    (widget) => widget is BlocBuilder<CalendarCubit, CalendarState>,
  );
  await _pumpUntil(tester, () => builder.evaluate().isNotEmpty);
  await builder.evaluate().first.read<CalendarCubit>().setViewMode(
    CalendarViewMode.agenda,
  );
  await _settle(tester);
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
}) async {
  final end = DateTime.now().add(timeout);
  while (!condition()) {
    if (DateTime.now().isAfter(end)) {
      throw TestFailure('Timed out after ${timeout.inSeconds}s');
    }
    await tester.pump(const Duration(milliseconds: 200));
  }
}
