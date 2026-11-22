import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/onboarding/data/onboarding_services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/design_render_harness.dart';
import 'onboarding_harness.dart';

/// Design review renders of the first-run onboarding on Sorbet. PNGs are
/// written only with `DESIGN_RENDER_DIR` set; otherwise each case is a smoke
/// test that the step lays out without overflow at phone and tablet sizes.
void main() {
  setUpAll(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          (_) async => null,
        );
  });

  Future<void> advance(WidgetTester tester) async {
    final next = find.byKey(const ValueKey('onboarding-primary'));
    await tester.ensureVisible(next);
    await tester.tap(next);
    await tester.pumpAndSettle();
  }

  Future<void> tapKey(WidgetTester tester, String key) async {
    final target = find.byKey(ValueKey(key));
    await tester.ensureVisible(target);
    await tester.tap(target);
    await tester.pumpAndSettle();
  }

  Future<void> show(
    WidgetTester tester,
    int step,
    Brightness brightness,
    Locale locale,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final h = OnboardingHarness()..createsWorkspace('Lotus Design Lab');
    h.services.invite = const OnboardingInvite(
      workspaceId: 'sunrise',
      workspaceName: 'Sunrise Studio',
      inviterName: 'Minh Tran',
    );
    await h.pump(
      tester,
      brightness: brightness,
      locale: locale,
      boundaryKey: DesignRenderApp.boundaryKey,
    );
    await tester.pumpAndSettle();
    if (step == 0) return;
    await advance(tester);
    await tapKey(tester, 'onboarding-space-team');
    await tester.enterText(
      find.byKey(const ValueKey('onboarding-workspace-name')),
      'Lotus Design Lab',
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    if (step == 1) {
      await tester.drag(find.byType(Scrollable).first, const Offset(0, 400));
      await tester.pumpAndSettle();
      return;
    }
    await advance(tester);
    for (final interest in ['calendar', 'tasks', 'mira']) {
      await tapKey(tester, 'onboarding-interest-$interest');
    }
    if (step == 2) return;
    await advance(tester);
  }

  const steps = ['profile', 'space', 'interests', 'done'];
  for (final (index, step) in steps.indexed) {
    for (final size in ['phone', 'tablet']) {
      for (final brightness in Brightness.values) {
        final name = '$step-$size-${brightness.name}-en';
        testWidgets('renders $name', (tester) async {
          await DesignRender.loadFonts();
          DesignRender.setSize(tester, DesignRender.sizes[size]!);
          await show(tester, index, brightness, const Locale('en'));
          expect(tester.takeException(), isNull);
          await DesignRender.capture(tester, 'onboarding-sorbet/$name');
        });
      }
    }
  }

  // Vietnamese step 1 on phones, where long copy is tightest.
  for (final brightness in Brightness.values) {
    final name = 'profile-phone-${brightness.name}-vi';
    testWidgets('renders $name', (tester) async {
      await DesignRender.loadFonts();
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await show(tester, 0, brightness, const Locale('vi'));
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'onboarding-sorbet/$name');
    });
  }
}
