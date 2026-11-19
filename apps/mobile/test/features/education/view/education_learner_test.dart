import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/features/education/view/education_flashcard_study.dart';
import 'package:mobile/features/education/view/education_home.dart';
import 'package:mobile/features/education/view/education_quiz_practice.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('home shows a course once with module facts', (tester) async {
    await tester.pumpApp(
      EducationHome(
        workspaceId: 'ws',
        courses: const [
          EducationCourse(id: 'course', name: 'Algebra', modulesCount: 4),
        ],
        courseCount: 1,
        quizCount: 0,
        quizSetCount: 0,
        flashcardCount: 0,
        attemptCount: 0,
        attempts: const [],
        onOpenCourse: (_) {},
        onOpenQuizzes: () {},
        onOpenQuizSets: () {},
        onOpenFlashcards: () {},
        onOpenAttempt: (_) {},
        onSeeCourses: () {},
        onSeeAttempts: () {},
      ),
    );

    expect(find.text('Continue learning'), findsOneWidget);
    expect(find.text('Algebra'), findsOneWidget);
    expect(find.text('4 modules'), findsOneWidget);
    expect(find.text('Education'), findsNothing);
  });

  testWidgets('quiz practice hides the answer until it is checked', (
    tester,
  ) async {
    await tester.pumpApp(
      EducationQuizPractice(
        loadQuizzes: () async => const [
          EducationQuiz(
            id: 'quiz',
            question: 'Two plus two?',
            options: [
              EducationQuizOption(id: 'a', value: 'Four', isCorrect: true),
              EducationQuizOption(id: 'b', value: 'Five', isCorrect: false),
            ],
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Correct'), findsNothing);
    expect(find.text('Not quite'), findsNothing);
    await tester.tap(find.text('Five'));
    await tester.pump();
    expect(find.text('Correct'), findsNothing);
    await tester.tap(find.text('Check'));
    await tester.pump();
    expect(find.text('Correct'), findsOneWidget);
    expect(find.text('Not quite'), findsOneWidget);
  });

  testWidgets('flashcard study reveals the back on demand', (tester) async {
    await tester.pumpApp(
      EducationFlashcardStudy(
        loadCards: () async => const [
          EducationFlashcard(id: 'card', front: 'Hola', back: 'Hello'),
        ],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Hola'), findsOneWidget);
    expect(find.text('Hello'), findsNothing);
    await tester.tap(find.text('Show answer'));
    await tester.pump();
    expect(find.text('Hello'), findsOneWidget);
    expect(find.text('Hola'), findsNothing);
  });
}
