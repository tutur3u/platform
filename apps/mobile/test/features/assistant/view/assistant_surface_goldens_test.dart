@Tags(['golden'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/features/assistant/widgets/assistant_action_card.dart';
import 'package:mobile/features/assistant/widgets/assistant_conversations.dart';

import '../../../helpers/golden_tolerance.dart';
import 'assistant_s5_shell_harness.dart';

void main() {
  setUpAssistantShellHarness();
  final original = goldenFileComparator;
  setUpAll(() {
    goldenFileComparator = GoldenTolerance(
      File(
        'test/features/assistant/view/assistant_surface_goldens_test.dart',
      ).absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);

  for (final (scene, route) in [
    ('assistant', Routes.assistant),
    ('conversations', Routes.assistantConversations),
  ]) {
    for (final (design, sorbet) in [
      ('classic', null),
      ('sorbet', const SorbetTheme()),
    ]) {
      for (final brightness in Brightness.values) {
        for (final (device, size, top, bottom) in [
          ('phone', const Size(390, 844), 48.0, 34.0),
          ('tablet', const Size(834, 1194), 24.0, 20.0),
        ]) {
          final name = '${scene}_${design}_${brightness.name}_$device';
          testWidgets(name, (tester) async {
            tester.view
              ..physicalSize = size
              ..devicePixelRatio = 1
              ..padding = FakeViewPadding(top: top, bottom: bottom)
              ..viewPadding = FakeViewPadding(top: top, bottom: bottom);
            addTearDown(tester.view.reset);
            await pumpAssistantShell(
              tester,
              repository: AssistantShellFixtureRepository(),
              initialLocation: route,
              brightness: brightness,
              sorbet: sorbet,
            );
            expect(
              route == Routes.assistant
                  ? find.byType(AssistantCompletedActionCard)
                  : find.byType(AssistantConversations),
              findsOneWidget,
            );
            // Linux owns the raster baselines.
            if (Platform.isLinux) {
              await expectLater(
                find.byKey(assistantBoundary),
                matchesGoldenFile('goldens/$name.png'),
              );
            }
          });
        }
      }
    }
  }
}
