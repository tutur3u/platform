import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../fixtures/store_team.dart';
import '../fixtures/tasks_fixture.dart';
import '../store_screenshot_app.dart';

class _StoreWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _StoreTimeTrackerRepository extends Mock
    implements ITimeTrackerRepository {}

WorkspaceCubit _workspaceCubit() {
  final cubit = _StoreWorkspaceCubit();
  const workspace = Workspace(
    id: StoreTeam.workspaceId,
    name: StoreTeam.workspaceName,
  );
  whenListen(
    cubit,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: workspace,
      workspaces: [workspace],
    ),
  );
  return cubit;
}

/// The launch board in Kanban view.
final StoreScreen tasksStoreScreen = StoreScreen(
  id: 'tasks',
  order: 2,
  shellLocation: '/tasks/boards/spring-launch',
  build: (locale) => MultiBlocProvider(
    providers: [
      BlocProvider<WorkspaceCubit>.value(value: _workspaceCubit()),
      BlocProvider(create: (_) => ShellChromeActionsCubit()),
    ],
    child: TaskBoardDetailPage(
      boardId: StoreTasksFixture.boardId(locale),
      taskRepository: StoreTaskRepository(locale),
      timeTrackerRepository: _StoreTimeTrackerRepository(),
      initialView: TaskBoardDetailView.kanban,
    ),
  ),
  // Kanban loads a window of three lists; wide layouts show all four.
  prepare: (tester, locale) async {
    final cubit = BlocProvider.of<TaskBoardDetailCubit>(
      tester.element(
        find.text(StoreTasksFixture.lists(locale).first.name!).first,
      ),
    );
    for (final list in StoreTasksFixture.lists(locale)) {
      await tester.runAsync(() => cubit.loadListTasks(listId: list.id));
    }
  },
);
