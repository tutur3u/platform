import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/tasks/view/task_list_page.dart';
import 'package:mobile/features/tasks/widgets/my_task_row.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mobile/features/tasks_boards/data/task_broadcast_client.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/pump_app.dart';
import '../../shell/view/shell_rail_harness.dart';
import 'task_experience_repository.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

class _NoBroadcast implements TaskBroadcastClient {
  const _NoBroadcast();

  @override
  TaskBroadcastSubscription subscribeToBoard({
    required String boardId,
    required TaskBroadcastHandler onEvent,
  }) => TaskBroadcastSubscription(() async {});

  @override
  TaskBroadcastSubscription subscribeToUser({
    required String userId,
    required TaskBroadcastHandler onEvent,
  }) => TaskBroadcastSubscription(() async {});

  @override
  Future<void> sendBroadcastMessage({
    required String channelName,
    required String event,
    required Map<String, dynamic> payload,
  }) async {}
}

const ValueKey<String> taskExperienceRenderKey = ValueKey(
  'task-experience-render',
);
final DateTime demoNow = DateTime(2026, 11, 19, 12);

Future<GoRouter> pumpTaskExperience(
  WidgetTester tester, {
  required TaskExperienceRepository repository,
  required String initialLocation,
  Brightness brightness = Brightness.light,
  SorbetTheme? sorbet,
  bool forGolden = false,
}) async {
  SharedPreferences.setMockInitialValues({});
  await tester.runAsync(CacheStore.instance.init);
  mockShellBackChannel();
  final profile = _Profile();
  final auth = _Auth();
  final workspace = _Workspace();
  const demoWorkspace = Workspace(id: 'demo-workspace', name: 'Demo studio');
  whenListen(
    profile,
    const Stream<ShellProfileState>.empty(),
    initialState: const ShellProfileState(),
  );
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: const AuthState.authenticated(
      User(
        id: 'demo-actor',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-01-01T00:00:00Z',
      ),
    ),
  );
  const team = Workspace(id: 'demo-team', name: 'Demo team');
  const initialWorkspace = WorkspaceState(
    status: WorkspaceStatus.loaded,
    currentWorkspace: demoWorkspace,
    workspaces: [demoWorkspace, team],
  );
  if (repository.showCrossWorkspaceTask) {
    final changes = StreamController<WorkspaceState>.broadcast();
    whenListen(workspace, changes.stream, initialState: initialWorkspace);
    when(() => workspace.selectWorkspace(team)).thenAnswer((_) async {
      changes.add(initialWorkspace.copyWith(currentWorkspace: team));
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
    addTearDown(() => unawaited(changes.close()));
  } else {
    whenListen(
      workspace,
      const Stream<WorkspaceState>.empty(),
      initialState: initialWorkspace,
    );
  }

  final router = GoRouter(
    initialLocation: initialLocation,
    routes: [
      ShellRoute(
        builder: (_, state, child) => ShellPage(
          matchedLocation: state.uri.path,
          enableDebugLogs: false,
          assistantPageBuilder: (_) => const SizedBox.shrink(),
          child: child,
        ),
        routes: [
          GoRoute(
            path: Routes.apps,
            builder: (_, _) => const SizedBox.shrink(),
          ),
          GoRoute(
            path: Routes.taskBoards,
            builder: (_, _) => const SizedBox.shrink(),
          ),
          GoRoute(
            path: Routes.taskAssigned,
            builder: (_, _) => routedTestPage(
              TaskListPage(
                taskRepository: repository,
                taskBroadcastClient: const _NoBroadcast(),
                clock: () => repository.now,
              ),
            ),
          ),
          GoRoute(
            path: Routes.taskBoardDetail,
            builder: (_, state) => routedTestPage(
              TaskBoardDetailPage(
                boardId: state.pathParameters['boardId']!,
                taskRepository: repository,
                taskBroadcastClient: const _NoBroadcast(),
                initialView: state.uri.queryParameters['view'] == 'kanban'
                    ? TaskBoardDetailView.kanban
                    : TaskBoardDetailView.list,
                initialTaskId: state.uri.queryParameters['taskId'],
                clock: () => repository.now,
              ),
            ),
          ),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);
  addTearDown(profile.close);
  addTearDown(auth.close);
  addTearDown(workspace.close);
  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<WorkspaceCubit>.value(value: workspace),
        BlocProvider<ShellProfileCubit>.value(value: profile),
        BlocProvider(
          create: (_) => AppTabCubit(settingsRepository: SettingsRepository()),
        ),
        BlocProvider(create: (_) => AssistantChromeCubit()),
        BlocProvider(create: (_) => ShellMiniNavCubit()),
        BlocProvider(create: (_) => ShellChromeActionsCubit()),
        BlocProvider(create: (_) => ShellTitleOverrideCubit()),
      ],
      child: routedSorbetTestApp(
        router: router,
        locale: const Locale('en'),
        brightness: brightness,
        sorbet: sorbet,
        boundaryKey: forGolden ? taskExperienceRenderKey : null,
      ),
    ),
  );
  await settleShell(tester);
  await tester.pumpAndSettle();
  if (initialLocation == Routes.taskAssigned) {
    await waitForTaskExperience(tester, find.byType(MyTaskRow));
    if (repository.delayMine == null) {
      await waitForFreshMyTasks(tester);
    }
  }
  return router;
}

Future<void> waitForTaskCondition(
  WidgetTester tester,
  bool Function() ready, {
  required String reason,
}) async {
  final deadline = DateTime.now().add(const Duration(seconds: 5));
  while (!ready() && DateTime.now().isBefore(deadline)) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump(const Duration(milliseconds: 16));
  }
  expect(ready(), isTrue, reason: reason);
}

Future<void> waitForFreshMyTasks(WidgetTester tester) async {
  final rows = find.byType(MyTaskRow);
  await waitForTaskCondition(tester, () {
    if (rows.evaluate().isEmpty) return false;
    final state = tester.element(rows.first).read<TaskListCubit>().state;
    return state.hasLoadedOnce && !state.isRefreshing && !state.isFromCache;
  }, reason: 'My Tasks publishes its refreshed snapshot');
}

Future<void> waitForTaskExperience(WidgetTester tester, Finder target) =>
    waitForTaskCondition(
      tester,
      () => target.evaluate().isNotEmpty,
      reason: 'Waiting for ${target.describeMatch(Plurality.many)}',
    );
