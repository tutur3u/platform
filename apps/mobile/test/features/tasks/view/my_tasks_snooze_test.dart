import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';

import '../../../helpers/phone_surface.dart';
import 'task_experience_harness.dart';
import 'task_experience_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  usePhoneSurface();

  testWidgets('a trailing swipe pushes a due date into Upcoming', (
    tester,
  ) async {
    final repo = TaskExperienceRepository(now: demoNow);
    await pumpTaskExperience(
      tester,
      repository: repo,
      initialLocation: Routes.taskAssigned,
    );
    final task = find.text('Prepare the release notes');
    final before = tester.getTopLeft(task).dy;
    await tester.drag(task, const Offset(-320, 0));
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(task).dy, greaterThan(before));
    expect(find.text('Nov 20'), findsOneWidget);
    await waitForTaskExperience(tester, find.text('Due date updated.'));
    expect(repo.moves, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
