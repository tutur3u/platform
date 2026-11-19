import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';

import '../../../helpers/phone_surface.dart';
import 'task_experience_harness.dart';
import 'task_experience_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  usePhoneSurface();

  testWidgets('sections collapse and filter without opening a board', (
    tester,
  ) async {
    final repo = TaskExperienceRepository(now: demoNow);
    final router = await pumpTaskExperience(
      tester,
      repository: repo,
      initialLocation: Routes.taskAssigned,
    );
    expect(find.text('My Tasks'), findsOneWidget);
    expect(find.text('Overdue'), findsOneWidget);
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Upcoming'), findsOneWidget);
    expect(find.text('No date'), findsOneWidget);
    expect(find.text('Review launch checklist'), findsOneWidget);

    await tester.tap(find.text('Overdue'));
    await tester.pumpAndSettle();
    expect(find.text('Review launch checklist'), findsNothing);

    await tester.tap(find.text('Labels'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Design'));
    await tester.pumpAndSettle();
    expect(find.text('Prepare the release notes'), findsOneWidget);
    expect(find.text('Sketch onboarding ideas'), findsOneWidget);
    expect(find.text('Collect feedback topics'), findsNothing);
    expect(router.routeInformationProvider.value.uri.path, Routes.taskAssigned);
    expect(repo.openedBoards, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
