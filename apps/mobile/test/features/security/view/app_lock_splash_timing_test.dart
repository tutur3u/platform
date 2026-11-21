import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/view/app_lock_gate.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final language in ['en', 'vi']) {
    testWidgets('compact large-text $language recovery remains accessible', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var attempts = 0;
      await tester.pumpApp(
        Builder(
          builder: (context) {
            return Localizations.override(
              context: context,
              locale: Locale(language),
              child: MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: const TextScaler.linear(2),
                  disableAnimations: true,
                ),
                child: AppLockGate(
                  authenticating: false,
                  onUnlock: () => attempts++,
                ),
              ),
            );
          },
        ),
      );
      expect(find.byKey(const ValueKey('app-splash-logo')), findsOneWidget);
      final button = find.byKey(const ValueKey('app-lock-unlock-button'));
      expect(tester.getSize(button).height, greaterThanOrEqualTo(48));
      await tester.ensureVisible(button);
      await tester.tap(button);
      expect(attempts, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('Unlock and its guidance show from the first frame', (
    tester,
  ) async {
    await tester.pumpApp(AppLockGate(authenticating: false, onUnlock: () {}));
    expect(
      find.byKey(const ValueKey('app-lock-unlock-button')),
      findsOneWidget,
    );
    expect(
      find.text(
        'Use biometrics or your device passcode in the system prompt to '
        'continue.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('a failed attempt says so and keeps Unlock available', (
    tester,
  ) async {
    var attempts = 0;
    await tester.pumpApp(
      AppLockGate(
        authenticating: false,
        failed: true,
        onUnlock: () => attempts++,
      ),
    );
    expect(
      find.text('Local authentication is unavailable or was cancelled.'),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const ValueKey('app-lock-unlock-button')));
    expect(attempts, 1);
  });

  testWidgets('an attempt in progress disables Unlock', (tester) async {
    var attempts = 0;
    await tester.pumpApp(
      AppLockGate(authenticating: true, onUnlock: () => attempts++),
    );
    expect(find.text('Unlocking...'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('app-lock-unlock-button')));
    expect(attempts, 0);
  });
}
