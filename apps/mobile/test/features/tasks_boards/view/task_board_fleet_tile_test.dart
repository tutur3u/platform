import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';

import 'task_board_row_actions_fixture.dart';

const _longTitle =
    'Migrate the meeting recorder pipeline to the new storage layer and '
    'backfill every historical transcript with the corrected speaker '
    'diarization model before the cutover window closes';

/// A board with one fleet card (block description) and one plain card.
class _FleetRepository extends RowActionsRepository {
  static List<TaskBoardTask> _tasks() {
    final updated = DateTime.now().toUtc().subtract(
      const Duration(minutes: 30),
    );
    final eta = DateTime.now().toUtc().subtract(
      const Duration(hours: 3, minutes: 5),
    );
    return [
      TaskBoardTask(
        id: 'fleet-1',
        listId: 'list-1',
        name: _longTitle,
        description:
            '<!-- fleet:v1 -->\n'
            'status: needs_user\n'
            'owner: atlas\n'
            'eta: ${eta.toIso8601String()}\n'
            'last_update: ${updated.toIso8601String()}\n'
            'needs_user: true\n'
            'needs_user_reason: Approve the cutover window\n'
            '<!-- /fleet:v1 -->',
      ),
      const TaskBoardTask(id: 'plain-1', listId: 'list-1', name: 'Plain task'),
    ];
  }

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async {
    final detail = await super.getTaskBoardDetail(wsId, boardId);
    return detail.copyWith(tasks: _tasks());
  }

  @override
  Future<List<TaskBoardTask>> getBoardTasksForList(
    String wsId, {
    required String listId,
    int limit = 50,
    int offset = 0,
    List<WorkspaceUserOption> members = const <WorkspaceUserOption>[],
    List<TaskLabel> labels = const <TaskLabel>[],
    List<TaskProjectSummary> projects = const <TaskProjectSummary>[],
  }) async => offset > 0 || listId != 'list-1' ? const [] : _tasks();
}

void main() {
  late RowActionsWorkspaceCubit workspaceCubit;

  setUp(() => workspaceCubit = rowActionsWorkspaceCubit());

  Future<void> pumpBoard(WidgetTester tester, {bool kanban = false}) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await pumpRowActionsBoard(
      tester,
      workspaceCubit: workspaceCubit,
      repository: _FleetRepository(),
    );
    if (kanban) {
      BlocProvider.of<TaskBoardDetailCubit>(
        tester.element(find.text('Plain task').first),
      ).setView(TaskBoardDetailView.kanban);
      await tester.pumpAndSettle();
    }
  }

  void expectFleetFace(WidgetTester tester) {
    final title = tester.widget<Text>(find.text(_longTitle));
    expect(title.maxLines, 2);
    expect(title.overflow, TextOverflow.ellipsis);
    // The list is active, so the chip reads Running; the callout stays.
    expect(find.text('Running'), findsOneWidget);
    expect(find.text('Needs you'), findsOneWidget);
    expect(find.text('Approve the cutover window'), findsOneWidget);
    expect(find.text('atlas'), findsOneWidget);
    expect(find.textContaining('overdue'), findsOneWidget);
    expect(find.textContaining('m ago'), findsOneWidget);
  }

  testWidgets('a fleet card in List view bounds its title and shows fields', (
    tester,
  ) async {
    await pumpBoard(tester);

    expectFleetFace(tester);
    expect(find.text('Plain task'), findsOneWidget);
    expect(find.text('Unowned'), findsNothing);
  });

  testWidgets('a fleet card in Kanban view bounds its title and shows fields', (
    tester,
  ) async {
    await pumpBoard(tester, kanban: true);

    expectFleetFace(tester);
    expect(find.text('Plain task'), findsOneWidget);
    expect(find.text('Unowned'), findsNothing);
  });
}
