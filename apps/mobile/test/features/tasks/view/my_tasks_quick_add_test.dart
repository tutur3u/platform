import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';

import '../../../helpers/phone_surface.dart';
import 'task_experience_harness.dart';
import 'task_experience_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  usePhoneSurface();

  testWidgets('the dock action creates an assigned task above the keyboard', (
    tester,
  ) async {
    final repo = TaskExperienceRepository(now: demoNow);
    await pumpTaskExperience(
      tester,
      repository: repo,
      initialLocation: Routes.taskAssigned,
    );
    await tester.tap(find.byTooltip('Create task').first);
    await tester.pumpAndSettle();
    final title = find.descendant(
      of: find.byKey(const ValueKey('my-task-title')),
      matching: find.byType(EditableText),
    );
    await tester.enterText(title, 'Draft release summary');
    tester.view.viewInsets = const FakeViewPadding(bottom: 250);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    final save = find.byKey(const ValueKey('my-task-save'));
    expect(tester.getBottomLeft(save).dy, lessThanOrEqualTo(594));

    final boardPicker = find.byKey(const ValueKey('my-task-board'));
    await tester.tap(boardPicker);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Studio launch').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choose list'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('To do').last);
    await tester.pumpAndSettle();

    final priority = find.byWidgetPredicate(
      (widget) => widget is AppSelect<String> && widget.title == 'Priority',
    );
    await tester.ensureVisible(priority);
    await tester.pumpAndSettle();
    await tester.tap(priority);
    await tester.pumpAndSettle();
    await tester.tap(find.text('High').last);
    await tester.pumpAndSettle();

    final due = find.byKey(const ValueKey('my-task-due'));
    await tester.ensureVisible(due);
    await tester.pumpAndSettle();
    await tester.tap(due);
    await tester.pumpAndSettle();
    await tester.tap(find.text('20').last);
    await tester.pumpAndSettle();
    await tester.tap(save);
    tester.view.resetViewInsets();
    await tester.pump();

    await waitForTaskExperience(tester, find.text('Task created.'));
    await tester.pumpAndSettle();
    final created = repo.creates.single;
    expect(created.name, 'Draft release summary');
    expect(created.listId, demoQueue.id);
    expect(created.assigneeIds, [demoActor.id]);
    expect(created.priority, 'high');
    expect(created.endDate, DateTime(2026, 11, 20, 23, 59, 59));
    expect(find.text('Draft release summary'), findsOneWidget);
    expect(repo.openedBoards, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
