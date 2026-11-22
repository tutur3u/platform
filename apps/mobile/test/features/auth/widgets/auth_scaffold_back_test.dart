import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/widgets/auth_scaffold.dart';

import '../../../helpers/helpers.dart';

void main() {
  group('AuthScaffold back button', () {
    // Regression: a null onBack used to fall back to maybePop(), so a
    // "disabled" Back during an in-flight sign-in could still pop the route
    // and, in add-account mode, cancel the flow mid-sign-in.
    testWidgets('stays inert while disabled, even with a step handler', (
      tester,
    ) async {
      var stepBacks = 0;
      var popAttempts = 0;
      await tester.pumpApp(
        PopScope(
          canPop: false,
          onPopInvokedWithResult: (_, _) => popAttempts++,
          child: AuthScaffold(
            showBackButton: true,
            backButtonLabel: 'Other ways to sign in',
            onBack: () => stepBacks++,
            backButtonEnabled: false,
            child: const SizedBox(height: 40),
          ),
        ),
      );

      await tester.tap(find.text('Other ways to sign in'));
      await tester.pump();

      expect(stepBacks, 0);
      expect(popAttempts, 0);
    });

    testWidgets('runs the step handler when enabled', (tester) async {
      var stepBacks = 0;
      await tester.pumpApp(
        AuthScaffold(
          showBackButton: true,
          backButtonLabel: 'Other ways to sign in',
          onBack: () => stepBacks++,
          child: const SizedBox(height: 40),
        ),
      );

      await tester.tap(find.text('Other ways to sign in'));
      await tester.pump();

      expect(stepBacks, 1);
    });
  });
}
