import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';

import '../../../helpers/phone_surface.dart';
import 'task_experience_harness.dart';
import 'task_experience_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  usePhoneSurface();

  testWidgets('tapping a task opens its workspace and board explicitly', (
    tester,
  ) async {
    final repo = TaskExperienceRepository(
      now: demoNow,
      showCrossWorkspaceTask: true,
    );
    final router = await pumpTaskExperience(
      tester,
      repository: repo,
      initialLocation: Routes.taskAssigned,
    );
    expect(repo.openedBoards, isEmpty);
    final task = find.text('Organize studio supplies');
    await tester.scrollUntilVisible(task, 160);
    await tester.tap(task);
    await tester.pumpAndSettle();
    expect(
      router.routeInformationProvider.value.uri.path,
      Routes.taskBoardDetailPath(demoOtherBoard.id),
    );
    expect(
      router.routeInformationProvider.value.uri.queryParameters['taskId'],
      'demo-spare',
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
