@Tags(['golden'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/features/shell/view/shell_brand_title.dart';

import '../../../helpers/design_render_harness.dart';
import 'task_experience_harness.dart';
import 'task_experience_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() => DesignRender.loadFonts(forGoldens: true));

  for (final (surface, route) in [
    ('my_tasks', Routes.taskAssigned),
    ('kanban', Routes.taskBoardDetailViewPath(demoBoard.id, 'kanban')),
  ]) {
    for (final (design, sorbet) in [
      ('classic', null),
      ('sorbet', const SorbetTheme()),
    ]) {
      for (final brightness in Brightness.values) {
        final name = '${surface}_${design}_${brightness.name}_phone';
        testWidgets(name, skip: !Platform.isLinux, (tester) async {
          tester.view
            ..physicalSize = const Size(390, 844)
            ..devicePixelRatio = 1
            ..padding = const FakeViewPadding(top: 48, bottom: 34)
            ..viewPadding = const FakeViewPadding(top: 48, bottom: 34);
          addTearDown(tester.view.reset);
          await pumpTaskExperience(
            tester,
            repository: TaskExperienceRepository(now: demoNow),
            initialLocation: route,
            brightness: brightness,
            sorbet: sorbet,
            forGolden: true,
          );
          expect(find.text('Review launch checklist'), findsOneWidget);
          if (surface == 'kanban') {
            final brandImage = find.descendant(
              of: find.byType(ShellBrandTitle),
              matching: find.byType(Image),
            );
            // A test shard can reach Kanban with a cold image cache.
            await tester.runAsync(
              () => precacheImage(
                tester.widget<Image>(brandImage).image,
                tester.element(brandImage),
              ),
            );
            await tester.pump();
          }
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(taskExperienceRenderKey),
            matchesGoldenFile('goldens/$name.png'),
          );
          await tester.pumpWidget(const SizedBox.shrink());
        });
      }
    }
  }
}
