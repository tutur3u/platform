import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/task_relationships.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _CrossBoardTaskRepository extends TaskRepository {
  static const _boardAId = 'board-a';
  static const _boardBId = 'board-b';
  static const _taskAId = 'task-a1';
  static const _taskA2Id = 'task-a2';
  static const _taskBId = 'task-b1';

  static const TaskBoardTask _taskA = TaskBoardTask(
    id: _taskAId,
    listId: 'list-a',
    displayNumber: 1,
    name: 'Task A1',
    relationshipsLoaded: true,
    relationships: TaskRelationshipsResponse(
      relatedTasks: [
        RelatedTaskInfo(
          id: _taskBId,
          name: 'Task B1',
          displayNumber: 1,
          boardId: _boardBId,
          boardName: 'Board B',
        ),
      ],
    ),
  );

  static const TaskBoardTask _taskB = TaskBoardTask(
    id: _taskBId,
    listId: 'list-b',
    displayNumber: 1,
    name: 'Task B1',
    relationshipsLoaded: true,
    relationships: TaskRelationshipsResponse(
      relatedTasks: [
        RelatedTaskInfo(
          id: _taskAId,
          name: 'Task A1',
          displayNumber: 1,
          boardId: _boardAId,
          boardName: 'Board A',
        ),
      ],
    ),
  );

  static const TaskBoardTask _taskA2 = TaskBoardTask(
    id: _taskA2Id,
    listId: 'list-a-2',
    displayNumber: 2,
    name: 'Task A2',
    relationshipsLoaded: true,
  );

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async {
    if (boardId == _boardAId) {
      return TaskBoardDetail(
        id: _boardAId,
        wsId: wsId,
        name: 'Board A',
        ticketPrefix: 'A',
        lists: const [
          TaskBoardList(
            id: 'list-a',
            boardId: _boardAId,
            name: 'Todo',
            status: 'active',
            color: 'BLUE',
            position: 0,
          ),
          TaskBoardList(
            id: 'list-a-2',
            boardId: _boardAId,
            name: 'Doing',
            status: 'active',
            color: 'GREEN',
            position: 1,
          ),
        ],
        tasks: const [_taskA, _taskA2],
      );
    }

    if (boardId == _boardBId) {
      return TaskBoardDetail(
        id: _boardBId,
        wsId: wsId,
        name: 'Board B',
        ticketPrefix: 'B',
        lists: const [
          TaskBoardList(
            id: 'list-b',
            boardId: _boardBId,
            name: 'Todo',
            status: 'active',
            color: 'GREEN',
          ),
        ],
        tasks: const [_taskB],
      );
    }

    throw StateError('Unknown board: $boardId');
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
  }) async {
    if (offset > 0) {
      return const <TaskBoardTask>[];
    }

    return switch (listId) {
      'list-a' => const <TaskBoardTask>[_taskA],
      'list-a-2' => const <TaskBoardTask>[_taskA2],
      'list-b' => const <TaskBoardTask>[_taskB],
      _ => const <TaskBoardTask>[],
    };
  }

  @override
  Future<TaskRelationshipsResponse> getTaskRelationships({
    required String wsId,
    required String taskId,
  }) async {
    return switch (taskId) {
      _taskAId => _taskA.relationships,
      _taskBId => _taskB.relationships,
      _ => TaskRelationshipsResponse.empty,
    };
  }
}

void setTestViewport(
  WidgetTester tester,
  Size size, {
  double devicePixelRatio = 1,
}) {
  tester.view.devicePixelRatio = devicePixelRatio;
  tester.view.physicalSize = size;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

Widget buildTestApp({
  required GoRouter routerConfig,
  required WorkspaceCubit workspaceCubit,
  shad.ThemeData? theme,
}) {
  return BlocProvider<WorkspaceCubit>.value(
    value: workspaceCubit,
    child: shad.ShadcnApp.router(
      theme:
          theme ??
          const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
      darkTheme: const shad.ThemeData.dark(
        colorScheme: shad.ColorSchemes.darkZinc,
      ),
      localizationsDelegates: const [
        ...AppLocalizations.localizationsDelegates,
        shad.ShadcnLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: routerConfig,
    ),
  );
}

void main() {
  group('Task relationship cross-board navigation', () {
    late _MockWorkspaceCubit workspaceCubit;
    late _CrossBoardTaskRepository taskRepository;
    late GoRouter router;

    setUp(() async {
      await CacheStore.instance.clearScope();
      workspaceCubit = _MockWorkspaceCubit();
      taskRepository = _CrossBoardTaskRepository();

      const workspace = Workspace(id: 'ws-1', name: 'Workspace');
      const workspaceState = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: workspace,
        workspaces: [workspace],
      );
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: workspaceState,
      );

      router = GoRouter(
        initialLocation: Routes.taskBoardDetailPath('board-a'),
        routes: [
          GoRoute(
            path: Routes.taskBoardDetail,
            builder: (context, state) {
              final boardId = state.pathParameters['boardId'];
              if (boardId == null || boardId.isEmpty) {
                return const SizedBox.shrink();
              }
              return shad.DrawerOverlay(
                child: TaskBoardDetailPage(
                  boardId: boardId,
                  initialTaskId: state.uri.queryParameters['taskId'],
                  taskRepository: taskRepository,
                ),
              );
            },
          ),
        ],
      );
    });

    tearDown(() async {
      await workspaceCubit.close();
      router.dispose();
    });

    testWidgets('opens initial task detail from cold-start taskId query', (
      tester,
    ) async {
      setTestViewport(tester, const Size(900, 1200));

      final deepLinkRouter = GoRouter(
        initialLocation:
            "${Routes.taskBoardDetailPath('board-a')}?taskId=task-a1",
        routes: [
          GoRoute(
            path: Routes.taskBoardDetail,
            builder: (context, state) {
              final boardId = state.pathParameters['boardId'];
              if (boardId == null || boardId.isEmpty) {
                return const SizedBox.shrink();
              }
              return shad.DrawerOverlay(
                child: TaskBoardDetailPage(
                  boardId: boardId,
                  initialTaskId: state.uri.queryParameters['taskId'],
                  taskRepository: taskRepository,
                ),
              );
            },
          ),
        ],
      );
      addTearDown(deepLinkRouter.dispose);

      await tester.pumpWidget(
        buildTestApp(
          routerConfig: deepLinkRouter,
          workspaceCubit: workspaceCubit,
        ),
      );
      await tester.pumpAndSettle();

      expect(
        deepLinkRouter.routeInformationProvider.value.uri.toString(),
        '/tasks/boards/board-a?taskId=task-a1',
      );
      expect(find.text('Relationships'), findsOneWidget);
      expect(find.text('Task A1'), findsWidgets);
    });

    testWidgets('pops task detail back to the board surface', (tester) async {
      setTestViewport(tester, const Size(900, 1200));

      await tester.pumpWidget(
        buildTestApp(routerConfig: router, workspaceCubit: workspaceCubit),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Task A1').first, warnIfMissed: false);
      await tester.pumpAndSettle();

      expect(
        router.routeInformationProvider.value.uri.toString(),
        '/tasks/boards/board-a?taskId=task-a1',
      );
      expect(find.text('Relationships'), findsOneWidget);

      await tester.tap(find.text('Back').last, warnIfMissed: false);
      await tester.pumpAndSettle();

      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.taskBoardDetailPath('board-a'),
      );
      expect(
        router.routeInformationProvider.value.uri.queryParameters['taskId'],
        isNull,
      );
      expect(find.text('Task A1'), findsWidgets);
    });

    testWidgets(
      'keeps the in-view kanban list after opening and closing task',
      (
        tester,
      ) async {
        setTestViewport(tester, const Size(900, 1200));

        await tester.pumpWidget(
          buildTestApp(routerConfig: router, workspaceCubit: workspaceCubit),
        );
        await tester.pumpAndSettle();

        await tester.drag(find.byType(PageView).first, const Offset(-820, 0));
        await tester.pumpAndSettle();

        expect(find.text('Doing'), findsOneWidget);
        expect(find.text('Task A2'), findsWidgets);

        await tester.tap(find.text('Task A2').first, warnIfMissed: false);
        await tester.pumpAndSettle();

        expect(
          router.routeInformationProvider.value.uri.toString(),
          '/tasks/boards/board-a?taskId=task-a2',
        );

        await tester.tap(find.text('Back').last, warnIfMissed: false);
        await tester.pumpAndSettle();

        expect(
          router.routeInformationProvider.value.uri.path,
          Routes.taskBoardDetailPath('board-a'),
        );
        expect(find.text('Doing'), findsOneWidget);
        expect(find.text('Task A2'), findsWidgets);

        await tester.drag(find.byType(PageView).first, const Offset(820, 0));
        await tester.pumpAndSettle();

        expect(find.text('Todo'), findsOneWidget);
      },
    );

    testWidgets('replaces current task sheet when navigating to other board', (
      tester,
    ) async {
      setTestViewport(tester, const Size(900, 1200));

      await tester.pumpWidget(
        buildTestApp(routerConfig: router, workspaceCubit: workspaceCubit),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Task A1').first, warnIfMissed: false);
      await tester.pumpAndSettle();

      final relationshipsTab = find
          .ancestor(
            of: find.byIcon(Icons.account_tree_outlined).last,
            matching: find.byType(InkWell),
          )
          .last;
      await tester.ensureVisible(relationshipsTab);
      await tester.tap(relationshipsTab, warnIfMissed: false);
      await tester.pumpAndSettle();

      router.go('/tasks/boards/board-b?taskId=task-b1');
      await tester.pumpAndSettle();

      expect(
        router.routeInformationProvider.value.uri.toString(),
        '/tasks/boards/board-b?taskId=task-b1',
      );
      expect(find.text('Task B1'), findsWidgets);
    });

    testWidgets('supports repeated cross-board navigation A to B to A', (
      tester,
    ) async {
      setTestViewport(tester, const Size(900, 1200));

      await tester.pumpWidget(
        buildTestApp(routerConfig: router, workspaceCubit: workspaceCubit),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Task A1').first, warnIfMissed: false);
      await tester.pumpAndSettle();

      var relationshipsTab = find.text('Relationships').last;
      await tester.ensureVisible(relationshipsTab);
      await tester.tap(relationshipsTab, warnIfMissed: false);
      await tester.pumpAndSettle();

      var linkedTask = find.text('Task B1').last;
      await tester.ensureVisible(linkedTask);
      await tester.tap(linkedTask, warnIfMissed: false);
      await tester.pumpAndSettle();

      expect(
        router.routeInformationProvider.value.uri.toString(),
        '/tasks/boards/board-b?taskId=task-b1',
      );

      relationshipsTab = find.text('Relationships').last;
      await tester.ensureVisible(relationshipsTab);
      await tester.tap(relationshipsTab, warnIfMissed: false);
      await tester.pumpAndSettle();

      linkedTask = find.text('Task A1').last;
      await tester.ensureVisible(linkedTask);
      await tester.tap(linkedTask, warnIfMissed: false);
      await tester.pumpAndSettle();

      expect(
        router.routeInformationProvider.value.uri.toString(),
        '/tasks/boards/board-a?taskId=task-a1',
      );
      expect(find.text('Task A1'), findsWidgets);
    });

    testWidgets('compact mode cross-board navigation does not blank page', (
      tester,
    ) async {
      setTestViewport(tester, const Size(390, 844));

      await tester.pumpWidget(
        buildTestApp(routerConfig: router, workspaceCubit: workspaceCubit),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Task A1').first, warnIfMissed: false);
      await tester.pumpAndSettle();

      final relationshipsTab = find.byIcon(Icons.account_tree_outlined).last;
      await tester.ensureVisible(relationshipsTab);
      await tester.tap(relationshipsTab, warnIfMissed: false);
      await tester.pumpAndSettle();

      router.go('/tasks/boards/board-b?taskId=task-b1');
      await tester.pumpAndSettle();

      expect(
        router.routeInformationProvider.value.uri.toString(),
        '/tasks/boards/board-b?taskId=task-b1',
      );
      expect(find.text('Task B1'), findsWidgets);
    });
  });
}
