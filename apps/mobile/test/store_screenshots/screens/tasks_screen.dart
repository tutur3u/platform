import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../fixtures/shell_frame_fixture.dart';
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

/// The launch board page over fixtures, optionally opened on one task.
Widget storeTaskBoardPage(
  StoreLocale locale, {
  String? initialTaskId,
  TaskBoardDetailView initialView = TaskBoardDetailView.kanban,
}) => MultiBlocProvider(
  providers: [
    BlocProvider<WorkspaceCubit>.value(value: _workspaceCubit()),
    BlocProvider(create: (_) => ShellChromeActionsCubit()),
  ],
  child: TaskBoardDetailPage(
    boardId: StoreTasksFixture.boardId(locale),
    taskRepository: StoreTaskRepository(locale),
    timeTrackerRepository: _StoreTimeTrackerRepository(),
    initialView: initialView,
    initialTaskId: initialTaskId,
  ),
);

/// The launch board in Kanban view.
final StoreScreen tasksStoreScreen = StoreScreen(
  id: 'tasks',
  order: 3,
  shellLocation: '/tasks/boards/spring-launch',
  build: storeTaskBoardPage,
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

const _connectivityChannel = MethodChannel(
  'dev.fluttercommunity.plus/connectivity',
);
const _connectivityStatusChannel = MethodChannel(
  'dev.fluttercommunity.plus/connectivity_status',
);

/// Reports Wi-Fi to the connectivity plugin the task detail screen watches.
/// Call from a test `setUp` and pair it with [clearStoreConnectivity].
void mockStoreConnectivity() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
    ..setMockMethodCallHandler(
      _connectivityChannel,
      (call) async => <String>['wifi'],
    )
    ..setMockMethodCallHandler(
      _connectivityStatusChannel,
      (call) async => null,
    );
}

/// Removes the handlers [mockStoreConnectivity] installed.
void clearStoreConnectivity() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
    ..setMockMethodCallHandler(_connectivityChannel, null)
    ..setMockMethodCallHandler(_connectivityStatusChannel, null);
}

/// One launch task open in the board's detail screen. Showcase only.
final StoreScreen taskDetailStoreScreen = StoreScreen(
  id: 'task-detail',
  order: 9,
  build: (locale) => storeShellFrame(
    location: Routes.taskBoardDetailPath(StoreTasksFixture.boardId(locale)),
    child: storeTaskBoardPage(locale, initialTaskId: 'store-task-landing'),
  ),
);
