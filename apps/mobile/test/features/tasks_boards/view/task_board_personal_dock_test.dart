import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import '../../../helpers/helpers.dart';
import 'task_board_row_actions_fixture.dart';

void main() {
  testWidgets('a board dock reads Tasks, Kanban, Timeline, no Settings', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final workspaceCubit = RowActionsWorkspaceCubit();
    const workspace = Workspace(id: 'ws-1', name: 'Personal', personal: true);
    whenListen(
      workspaceCubit,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: workspace,
        workspaces: [workspace],
      ),
    );
    final miniNav = ShellMiniNavCubit();
    addTearDown(miniNav.close);

    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
          BlocProvider(create: (_) => ShellChromeActionsCubit()),
          BlocProvider.value(value: miniNav),
        ],
        child: TaskBoardDetailPage(
          boardId: 'board-1',
          taskRepository: RowActionsRepository(),
        ),
      ),
    );
    for (var i = 0; i < 3; i++) {
      await tester.pump(const Duration(milliseconds: 350));
    }
    await tester.pumpAndSettle();

    final registration = miniNav.state.registrations.values.singleWhere(
      (entry) => entry.ownerId.startsWith('task-board-mini-nav'),
    );
    expect(registration.items.map((item) => item.id), [
      'back',
      'tasks',
      'kanban',
      'timeline',
    ]);
    expect(registration.items.skip(1).map((item) => item.label), [
      'Tasks',
      'Kanban',
      'Timeline',
    ]);
  });

  test('Settings stays on the Tasks root mini-nav', () {
    final tasks = AppRegistry.allModules.singleWhere(
      (module) => module.id == 'tasks',
    );
    expect(tasks.miniAppNavItems.map((item) => item.id), [
      'tasks_home',
      'tasks_assigned',
      'tasks_settings',
    ]);
    expect(tasks.miniAppNavItems.last.route, Routes.taskSettings);
  });
}
