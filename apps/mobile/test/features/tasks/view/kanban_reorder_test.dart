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
    await waitForTaskCondition(
      tester,
      () =>
          repo.openedBoards.length >= 2 &&
          !cubit.state.isMutating &&
          cubit.state.status == TaskBoardDetailStatus.loaded,
      reason: 'The board revalidates after saving the new order',
    );
    await tester.pumpAndSettle();
    expect(
      tester.getTopLeft(find.text('Sketch onboarding ideas')).dy,
      lessThan(tester.getTopLeft(find.text('Review launch checklist')).dy),
    );
  });
}
