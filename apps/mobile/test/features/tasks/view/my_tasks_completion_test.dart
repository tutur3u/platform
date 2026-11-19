@Timeout(Duration(seconds: 45))
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';

import '../../../helpers/phone_surface.dart';
import 'task_experience_harness.dart';
import 'task_experience_repository.dart';

void main() {
  usePhoneSurface();

  testWidgets('completion moves once, and Undo restores the original list', (
    tester,
  ) async {
    final repo = TaskExperienceRepository(now: demoNow);
    await pumpTaskExperience(
      tester,
      repository: repo,
      initialLocation: Routes.taskAssigned,
    );
    await tester.tap(
      find.byKey(const ValueKey('my-task-complete-demo-overdue')),
    );
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpAndSettle();
    expect(repo.moves, [('demo-overdue', demoDone.id)]);
    expect(find.text('Review launch checklist'), findsNothing);
    await waitForTaskExperience(tester, find.text('Task completed'));

    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(repo.moves, [
      ('demo-overdue', demoDone.id),
      ('demo-overdue', demoQueue.id),
    ]);
    expect(find.text('Review launch checklist'), findsOneWidget);
    await waitForTaskCondition(
      tester,
      () =>
          TaskListCubit.seedStateFor(
            wsId: 'demo-workspace',
            isPersonal: false,
            userId: demoActor.id,
          )?.overdueTasks.any((task) => task.id == 'demo-overdue') ??
          false,
      reason: 'Undo persists the restored task in Overdue',
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
