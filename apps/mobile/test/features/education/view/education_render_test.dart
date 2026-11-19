import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/features/education/view/education_home.dart';

import '../../../helpers/design_render_harness.dart';

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness.name;
    testWidgets('education home $name', (tester) async {
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      final settings = brightness == Brightness.dark
          ? DesignRender.themes['dark']!.$1
          : DesignRender.themes['light']!.$1;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: EducationHome(
            workspaceId: 'ws',
            courses: const [
              EducationCourse(
                id: 'algebra',
                name: 'Algebra',
                description: 'Linear equations',
                modulesCount: 4,
              ),
              EducationCourse(id: 'writing', name: 'Writing', modulesCount: 2),
            ],
            courseCount: 2,
            quizCount: 6,
            quizSetCount: 3,
            flashcardCount: 12,
            attemptCount: 1,
            attempts: const [
              EducationAttemptSummary(
                id: 'attempt',
                attemptNumber: 1,
                totalScore: 8,
                durationSeconds: 90,
                setName: 'Chapter 1',
                learnerName: 'Ada',
                completedAt: '2026-11-19T02:00:00.000Z',
              ),
            ],
            onOpenCourse: (_) {},
            onOpenQuizzes: () {},
            onOpenQuizSets: () {},
            onOpenFlashcards: () {},
            onOpenAttempt: (_) {},
            onSeeCourses: () {},
            onSeeAttempts: () {},
          ),
        ),
      );
      await tester.pump();
      expect(find.text('Algebra'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'education-home-$name');
    });
  }
}
