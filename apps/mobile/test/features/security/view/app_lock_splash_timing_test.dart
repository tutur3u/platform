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
      await tester.pump(const Duration(seconds: 5));
      final button = find.byKey(const ValueKey('app-lock-unlock-button'));
      expect(tester.getSize(button).height, greaterThanOrEqualTo(48));
      await tester.ensureVisible(button);
      await tester.tap(button);
      expect(attempts, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('removed lock entry cancels delayed recovery', (tester) async {
    await tester.pumpApp(AppLockGate(authenticating: false, onUnlock: () {}));
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 6));
    expect(tester.takeException(), isNull);
  });

  testWidgets('recovery is hidden until five seconds from entry', (
    tester,
  ) async {
    await tester.pumpApp(AppLockGate(authenticating: false, onUnlock: () {}));
    expect(find.byKey(const ValueKey('app-lock-unlock-button')), findsNothing);
    await tester.pump(const Duration(milliseconds: 4999));
    expect(find.byKey(const ValueKey('app-lock-unlock-button')), findsNothing);
    await tester.pump(const Duration(milliseconds: 1));
    expect(
      find.byKey(const ValueKey('app-lock-unlock-button')),
      findsOneWidget,
    );
  });

  testWidgets('failed attempt rebuild does not reset entry deadline', (
    tester,
  ) async {
    final authenticating = ValueNotifier(true);
    await tester.pumpApp(
      ValueListenableBuilder<bool>(
        valueListenable: authenticating,
        builder: (_, value, _) =>
            AppLockGate(authenticating: value, onUnlock: () {}),
      ),
    );
    await tester.pump(const Duration(seconds: 4));
    authenticating.value = false;
    await tester.pump();
    expect(find.byKey(const ValueKey('app-lock-unlock-button')), findsNothing);
    await tester.pump(const Duration(seconds: 1));
    expect(
      find.byKey(const ValueKey('app-lock-unlock-button')),
      findsOneWidget,
    );
  });
}
