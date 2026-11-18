import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/startup/local_preferences.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_summary.dart';
import 'package:mobile/data/models/task_boards_page.dart' as data;
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/tasks_boards/view/task_boards_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/pump_app.dart';

const _personal = Workspace(id: 'personal', name: 'Personal', personal: true);
const _shared = Workspace(id: 'shared', name: 'Shared');
const _defaultBoardId = 'default-board';
const _boardPath = '/tasks/boards/$_defaultBoardId';

void main() {
  setUpAll(CacheStore.instance.init);

  setUp(() {
    SharedPreferences.setMockInitialValues({
      'last-app-route': Routes.tasks,
      'personal-default-task-board-id-${_personal.id}': _defaultBoardId,
    });
  });

  for (final savedRoute in [Routes.tasks, '$_boardPath?view=list']) {
    testWidgets('launch restores $savedRoute to the board list', (
      tester,
    ) async {
      final settings = SettingsRepository();
      await settings.setLastTabRoute(savedRoute);
      final preferences = await loadStartupPreferences(
        initializeHaptics: () async {},
        loadTheme: () async => ThemeMode.system,
        configureChrome: (_) async {},
        loadTabRoute: settings.getLastTabRoute,
        loadAppRoute: settings.getLastAppRoute,
      );
      expect(preferences.initialRoute, Routes.tasks);

      final harness = _TasksHarness(initialLocation: preferences.initialRoute!);
      await harness.pump(tester);
      harness.expectBoardList(tester, Routes.tasks, boardLabel: 'Tasks');
    });
  }

  testWidgets('opening Tasks from Home shows the board list', (tester) async {
    final harness = _TasksHarness(initialLocation: Routes.home);
    await harness.pump(tester);
    await tester.tap(find.text('Open Tasks'));
    await tester.pumpAndSettle();

    harness.expectBoardList(tester, Routes.tasks, boardLabel: 'Tasks');
  });

  testWidgets('opening Boards directly shows the board list', (tester) async {
    final harness = _TasksHarness(initialLocation: Routes.taskBoards);
    await harness.pump(tester);
    harness.expectBoardList(tester, Routes.taskBoards, boardLabel: 'Tasks');
  });

  for (final status in [404, 403]) {
    testWidgets('returning from a board that responds $status stays on Tasks', (
      tester,
    ) async {
      final harness = _TasksHarness(
        initialLocation: _boardPath,
        detailStatus: status,
      );
      await harness.pump(tester);
      expect(harness.repository.detailRequests, [
        (_personal.id, _defaultBoardId),
      ]);
      expect(
        find.text("Couldn't load board details right now"),
        findsOneWidget,
      );

      harness.boardRouteAttempts.clear();
      harness.repository.detailRequests.clear();
      harness.router.go(Routes.tasks);
      await tester.pumpAndSettle();

      harness.expectBoardList(tester, Routes.tasks, boardLabel: 'Tasks');
    });
  }

  testWidgets('an empty personal workspace ignores a stale default ID', (
    tester,
  ) async {
    final harness = _TasksHarness(hasPersonalBoard: false);
    await harness.pump(tester);

    harness.expectBoardList(tester, Routes.tasks, boardLabel: 'No boards yet');
  });

  testWidgets('switching workspaces on Tasks refreshes the list in place', (
    tester,
  ) async {
    final harness = _TasksHarness();
    await harness.pump(tester);
    harness
      ..expectBoardList(tester, Routes.tasks, boardLabel: 'Tasks')
      ..selectWorkspace(_shared);
    await tester.pumpAndSettle();

    harness.expectBoardList(tester, Routes.tasks, boardLabel: 'No boards yet');
    expect(find.text('Tasks'), findsNothing);

    harness.selectWorkspace(_personal);
    await tester.pumpAndSettle();

    harness.expectBoardList(tester, Routes.tasks, boardLabel: 'Tasks');
  });

  testWidgets('tapping a board opens its details and Back restores Tasks', (
    tester,
  ) async {
    final harness = _TasksHarness();
    await harness.pump(tester);
    harness.expectBoardList(tester, Routes.tasks, boardLabel: 'Tasks');

    await tester.tap(find.text('Tasks'));
    await tester.pumpAndSettle();
    harness.expectBoardDetail(tester);

    harness.boardRouteAttempts.clear();
    harness.repository.detailRequests.clear();
    harness.router.pop();
    await tester.pumpAndSettle();
    harness.expectBoardList(tester, Routes.tasks, boardLabel: 'Tasks');
  });

  testWidgets('a direct board link launches the requested details', (
    tester,
  ) async {
    final link = resolveMobileDeepLink(
      Uri.parse('https://tuturuuu.com/personal/tasks/boards/$_defaultBoardId'),
    );
    expect(link, isNotNull);
    final harness = _TasksHarness(initialLocation: link!.location);
    await harness.pump(tester);

    harness.expectBoardDetail(tester);
  });
}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockPermissionsRepository extends Mock
    implements WorkspacePermissionsRepository {}

class _TasksHarness {
  _TasksHarness({
    String initialLocation = Routes.tasks,
    bool hasPersonalBoard = true,
    int? detailStatus,
  }) : repository = _TaskRepository(
         hasPersonalBoard: hasPersonalBoard,
         detailStatus: detailStatus,
       ) {
    whenListen(
      _workspaceCubit,
      _workspaceChanges.stream,
      initialState: _workspaceState(_personal),
    );
    when(
      () => _permissions.getPermissions(wsId: any(named: 'wsId')),
    ).thenAnswer(
      (_) async => const WorkspacePermissions(
        permissions: {'manage_projects'},
        isCreator: false,
      ),
    );
    router = GoRouter(
      initialLocation: initialLocation,
      routes: [
        GoRoute(
          path: Routes.home,
          builder: (context, _) => Center(
            child: TextButton(
              onPressed: () => context.go(Routes.tasks),
              child: const Text('Open Tasks'),
            ),
          ),
        ),
        AppRegistry.routes.singleWhere((route) => route.path == Routes.tasks),
        GoRoute(
          path: Routes.taskBoards,
          builder: (_, _) => const TaskBoardsPage(),
        ),
        GoRoute(
          path: Routes.taskBoardDetail,
          redirect: (_, state) {
            boardRouteAttempts.add(state.uri.path);
            return null;
          },
          builder: (_, state) => TaskBoardDetailPage(
            boardId: state.pathParameters['boardId']!,
            taskRepository: repository,
          ),
        ),
      ],
    );
    addTearDown(_workspaceChanges.close);
    addTearDown(router.dispose);
  }

  final _workspaceCubit = _MockWorkspaceCubit();
  final _workspaceChanges = StreamController<WorkspaceState>.broadcast();
  final _permissions = _MockPermissionsRepository();
  final _TaskRepository repository;
  final boardRouteAttempts = <String>[];
  late final GoRouter router;

  static WorkspaceState _workspaceState(Workspace workspace) => WorkspaceState(
    status: WorkspaceStatus.loaded,
    currentWorkspace: workspace,
    workspaces: const [_personal, _shared],
  );

  void selectWorkspace(Workspace workspace) =>
      _workspaceChanges.add(_workspaceState(workspace));

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpAppRouter(
      router,
      wrap: (app) => MultiRepositoryProvider(
        providers: [
          RepositoryProvider<TaskRepository>.value(value: repository),
          RepositoryProvider<WorkspacePermissionsRepository>.value(
            value: _permissions,
          ),
        ],
        child: BlocProvider<WorkspaceCubit>.value(
          value: _workspaceCubit,
          child: app,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  void expectBoardList(
    WidgetTester tester,
    String route, {
    required String boardLabel,
  }) {
    expect(router.state.matchedLocation, route);
    expect(router.canPop(), isFalse);
    expect(boardRouteAttempts, isEmpty);
    expect(repository.detailRequests, isEmpty);
    expect(find.byType(TaskBoardsPage), findsOneWidget);
    expect(find.text(boardLabel), findsOneWidget);
    expect(tester.takeException(), isNull);
  }

  void expectBoardDetail(WidgetTester tester) {
    expect(
      router.routerDelegate.currentConfiguration.last.matchedLocation,
      _boardPath,
    );
    expect(
      tester
          .widget<TaskBoardDetailPage>(find.byType(TaskBoardDetailPage))
          .boardId,
      _defaultBoardId,
    );
    expect(repository.detailRequests, [(_personal.id, _defaultBoardId)]);
    expect(tester.takeException(), isNull);
  }
}

class _TaskRepository extends TaskRepository {
  _TaskRepository({required this.hasPersonalBoard, this.detailStatus});

  final bool hasPersonalBoard;
  final int? detailStatus;
  final detailRequests = <(String, String)>[];

  @override
  Future<data.TaskBoardsPage> getTaskBoards(
    String wsId, {
    int page = 1,
    int pageSize = 20,
    String status = 'all',
  }) async {
    final boards = [
      if (wsId == _personal.id && hasPersonalBoard)
        TaskBoardSummary(
          id: _defaultBoardId,
          wsId: wsId,
          name: 'Tasks',
          createdAt: DateTime.utc(2026),
        ),
    ];
    return data.TaskBoardsPage(
      boards: boards,
      totalCount: boards.length,
      page: page,
      pageSize: pageSize,
    );
  }

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async {
    detailRequests.add((wsId, boardId));
    if (detailStatus case final status?) {
      throw ApiException(statusCode: status, message: 'Board unavailable');
    }
    return TaskBoardDetail(id: boardId, wsId: wsId, name: 'Tasks');
  }
}
