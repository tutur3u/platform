import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';

import '../../../helpers/phone_surface.dart';
import 'task_experience_harness.dart';
import 'task_experience_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  usePhoneSurface();
  setUpAll(CacheStore.instance.init);

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
    await tester.tap(priority);
    await tester.pumpAndSettle();
    await tester.tap(find.text('High').last);
    await tester.pumpAndSettle();

    final due = find.byKey(const ValueKey('my-task-due'));
    await tester.ensureVisible(due);
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

  testWidgets('a warm snapshot renders while revalidation is pending', (
    tester,
  ) async {
    final repo = TaskExperienceRepository(now: demoNow);
    final page = await repo.getMyTasks(
      wsId: 'demo-workspace',
      isPersonal: false,
    );
    final ready = Completer<void>();
    repo.delayMine = ready.future;
    final key = TaskListCubit.offlineSummaryKey(
      'demo-workspace',
      isPersonal: false,
      userId: demoActor.id,
    );
    await tester.runAsync(
      () => CacheStore.instance.write(
        key: key,
        policy: CachePolicies.summary,
        payload: page.toJson(),
      ),
    );
    addTearDown(() => CacheStore.instance.remove(key));

    await pumpTaskExperience(
      tester,
      repository: repo,
      initialLocation: Routes.taskAssigned,
    );
    expect(find.text('Review launch checklist'), findsOneWidget);
    expect(repo.openedBoards, isEmpty);
    ready.complete();
    await waitForFreshMyTasks(tester);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
