import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/data/repositories/education_repository.dart';
import 'package:mobile/features/education/view/education_page.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/design_render_harness.dart';

class _Repository extends Mock implements EducationRepository {}

EducationPagedResult<T> _page<T>(List<T> items) => EducationPagedResult(
  items: items,
  count: items.length,
  page: 1,
  pageSize: 20,
);

Future<void> _open(WidgetTester tester, String id) async {
  final nav = tester.widget<ShellMiniNav>(find.byType(ShellMiniNav));
  nav.items.singleWhere((item) => item.id == id).onPressed!();
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness.name;
    testWidgets('education courses $name', (tester) async {
      final repository = _Repository();
      when(
        () => repository.getCourses(
          any(),
          query: any(named: 'query'),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) async => _page(const [
          EducationCourse(
            id: 'algebra',
            name: 'Algebra',
            description: 'Linear equations',
            modulesCount: 4,
          ),
          EducationCourse(id: 'writing', name: 'Writing', modulesCount: 2),
        ]),
      );
      when(
        () => repository.getQuizzes(
          any(),
          query: any(named: 'query'),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => _page(const <EducationQuiz>[]));
      when(
        () => repository.getQuizSets(
          any(),
          query: any(named: 'query'),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => _page(const <EducationQuizSet>[]));
      when(
        () => repository.getFlashcards(
          any(),
          query: any(named: 'query'),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => _page(const <EducationFlashcard>[]));
      when(
        () => repository.getAttempts(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          setId: any(named: 'setId'),
          sortBy: any(named: 'sortBy'),
          sortDirection: any(named: 'sortDirection'),
        ),
      ).thenAnswer(
        (_) async => const EducationAttemptListResult(
          attempts: [
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
          count: 1,
          page: 1,
          pageSize: 20,
          sets: [],
        ),
      );
      when(() => repository.getLearnerProgress(any())).thenAnswer(
        (_) async => const EducationLearnerProgress(
          courses: [
            EducationCourseProgress(
              courseId: 'algebra',
              completedModules: 2,
              totalModules: 4,
              completionRatio: 0.5,
            ),
          ],
          attemptCount: 0,
          attempts: [],
        ),
      );

      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      final settings = brightness == Brightness.dark
          ? DesignRender.themes['dark']!.$1
          : DesignRender.themes['light']!.$1;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: EducationWorkspace(
            actorId: 'ada',
            workspaceId: 'ws',
            repository: repository,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await _open(tester, 'education-courses');
      expect(find.text('Algebra'), findsWidgets);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'education-courses-$name');
      await _open(tester, 'education-library');
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'education-library-$name');
      await _open(tester, 'education-attempts');
      expect(find.text('Ada'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'education-attempts-$name');
    });
  }
}
