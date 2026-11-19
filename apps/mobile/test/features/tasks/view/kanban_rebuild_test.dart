import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';

import '../../../helpers/phone_surface.dart';
import 'task_experience_harness.dart';
import 'task_experience_repository.dart';

void main() {
  usePhoneSurface();

  String boardLocation() =>
      Routes.taskBoardDetailViewPath(demoBoard.id, 'kanban');
  Finder dragCard(String id) => find.byKey(ValueKey('kanban-drag-$id'));
  Finder column(String id) => find.byKey(ValueKey('kanban-column-$id'));

  testWidgets(
    'long press and edge scroll can move a card with one ordered write',
    (tester) async {
      final repo = TaskExperienceRepository(now: demoNow);
      await pumpTaskExperience(
        tester,
        repository: repo,
        initialLocation: boardLocation(),
      );
      final source = dragCard('demo-overdue');
      final destination = column(demoActive.id);
      expect(
        tester.getSize(column(demoQueue.id)).width,
        closeTo(390 * .86, 14),
      );
      final cubit = tester.element(source).read<TaskBoardDetailCubit>();
      final location = tester.getCenter(source);
      final done = tester.getTopLeft(destination);
      final drag = await tester.startGesture(location);
      await tester.pump(kLongPressTimeout + const Duration(milliseconds: 80));
      await drag.moveTo(Offset(381, done.dy + 63));
      await tester.pump(const Duration(milliseconds: 120));
      expect(repo.placements, isEmpty);
      expect(repo.moves, isEmpty);

      await drag.up();
      await tester.pumpAndSettle();
      final write = repo.placements.single;
      expect(write.$1, 'demo-overdue');
      expect(write.$2['list_id'], demoActive.id);
      expect(write.$2['sort_key'], lessThan(1000000));
      expect(repo.moves, isEmpty);
      expect(
        cubit.state.listTasksByListId[demoActive.id]!.map((item) => item.id),
        contains('demo-overdue'),
      );
      expect(
        cubit.state.listTasksByListId[demoQueue.id]!.map((item) => item.id),
        isNot(contains('demo-overdue')),
      );
    },
  );

  testWidgets('reorder persists when the board refreshes', (tester) async {
    final repo = TaskExperienceRepository(now: demoNow);
    await pumpTaskExperience(
      tester,
      repository: repo,
      initialLocation: boardLocation(),
    );
    final first = dragCard('demo-overdue');
    final third = dragCard('demo-upcoming');
    final cubit = tester.element(first).read<TaskBoardDetailCubit>();
    final rect = tester.getRect(first);
    final drag = await tester.startGesture(tester.getCenter(third));
    await tester.pump(kLongPressTimeout + const Duration(milliseconds: 60));
    await drag.moveTo(Offset(rect.center.dx, rect.top + 8));
    await tester.pump(const Duration(milliseconds: 100));
    await drag.up();
    await tester.pumpAndSettle();
    expect(repo.placements.single.$1, 'demo-upcoming');
    expect(repo.placements.single.$2.keys, ['sort_key']);
    await waitForTaskExperience(tester, third);
    var refreshed = false;
    unawaited(cubit.reload().then((_) => refreshed = true));
    await waitForTaskCondition(
      tester,
      () => refreshed,
      reason: 'The board reload finishes',
    );
    await tester.pumpAndSettle();
    await waitForTaskExperience(tester, third);
    expect(tester.getTopLeft(third).dy, lessThan(tester.getTopLeft(first).dy));
  });

  testWidgets('the top action toggles List and the board picker is explicit', (
    tester,
  ) async {
    final repo = TaskExperienceRepository(now: demoNow);
    final router = await pumpTaskExperience(
      tester,
      repository: repo,
      initialLocation: boardLocation(),
    );
    expect(repo.openedBoards, [demoBoard.id]);
    final toggle = find.byKey(
      const ValueKey('shell-action-button-task-board-detail-view'),
    );
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(dragCard('demo-overdue'), findsNothing);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(dragCard('demo-overdue'), findsOneWidget);

    await tester.tap(
      find.byKey(
        const ValueKey('shell-action-button-task-board-detail-switch'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Studio operations').last);
    await tester.pumpAndSettle();
    expect(
      router.routeInformationProvider.value.uri.path,
      Routes.taskBoardDetailPath(demoOtherBoard.id),
    );
    expect(repo.openedBoards.last, demoOtherBoard.id);
    expect(dragCard('demo-spare'), findsOneWidget);
  });

  testWidgets(
    'a card opens editable details including description and subtasks',
    (tester) async {
      final repo = TaskExperienceRepository(now: demoNow);
      await pumpTaskExperience(
        tester,
        repository: repo,
        initialLocation: boardLocation(),
      );
      await tester.tap(find.text('Review launch checklist'));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('task-quick-priority-critical')),
        findsOneWidget,
      );

      final description = find.byKey(
        const ValueKey('kanban-detail-edit-description'),
      );
      await tester.ensureVisible(description);
      await tester.pumpAndSettle();
      await tester.tap(description);
      await tester.pumpAndSettle();
      expect(find.byTooltip('Done'), findsWidgets);
      await tester.ensureVisible(description);
      await tester.pumpAndSettle();
      await tester.tap(description);
      await tester.pumpAndSettle();

      final relationships = find.byKey(
        const ValueKey('kanban-detail-relationships'),
      );
      await tester.ensureVisible(relationships);
      await tester.pumpAndSettle();
      await tester.tap(relationships);
      await tester.pumpAndSettle();
      expect(find.text('Subtasks'), findsOneWidget);
      expect(find.text('Related tasks'), findsOneWidget);
    },
  );
}
