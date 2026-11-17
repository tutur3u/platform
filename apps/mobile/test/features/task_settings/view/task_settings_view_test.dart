import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/task_settings/view/task_settings_page.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_labels_cubit.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimate_dialog.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Estimates extends MockCubit<TaskEstimatesState>
    implements TaskEstimatesCubit {}

class _Labels extends MockCubit<TaskLabelsState> implements TaskLabelsCubit {}

class _Portfolio extends MockCubit<TaskPortfolioState>
    implements TaskPortfolioCubit {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

const _workspace = Workspace(id: 'ws-1', name: 'Team');

final _boards = [
  TaskEstimateBoard(
    id: 'board-1',
    name: 'Product',
    estimationType: 'fibonacci',
    createdAt: DateTime(2026, 5, 5),
  ),
  TaskEstimateBoard(
    id: 'board-2',
    name: 'Operations',
    createdAt: DateTime(2026, 5, 6),
  ),
];

const _labels = [
  TaskLabel(id: 'l-1', wsId: 'ws-1', name: 'Bug', color: '#ff0000'),
  TaskLabel(id: 'l-2', wsId: 'ws-1', name: 'Docs', color: '#00ff00'),
];

/// Pumps Task settings with stub screens behind its rows; [canManage]
/// controls the `manage_projects` permission.
Future<GoRouter> _pump(WidgetTester tester, {required bool canManage}) async {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final auth = _Auth();
  final workspaces = _Workspaces();
  final estimates = _Estimates();
  final labels = _Labels();
  final portfolio = _Portfolio();
  final permissions = _Permissions();
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: const AuthState.authenticated(
      User(
        id: 'user-1',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-01-01T00:00:00Z',
      ),
    ),
  );
  whenListen(
    workspaces,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: _workspace,
      workspaces: [_workspace],
    ),
  );
  whenListen(
    estimates,
    const Stream<TaskEstimatesState>.empty(),
    initialState: TaskEstimatesState(
      status: TaskEstimatesStatus.loaded,
      boards: _boards,
    ),
  );
  whenListen(
    labels,
    const Stream<TaskLabelsState>.empty(),
    initialState: const TaskLabelsState(
      status: TaskLabelsStatus.loaded,
      labels: _labels,
    ),
  );
  whenListen(
    portfolio,
    const Stream<TaskPortfolioState>.empty(),
    initialState: const TaskPortfolioState(
      status: TaskPortfolioStatus.loaded,
      workspaceId: 'ws-1',
    ),
  );
  when(
    () => permissions.getPermissions(
      wsId: any(named: 'wsId'),
      userId: any(named: 'userId'),
    ),
  ).thenAnswer(
    (_) async => WorkspacePermissions(
      permissions: canManage ? {'manage_projects'} : const <String>{},
      isCreator: false,
    ),
  );

  final router = GoRouter(
    initialLocation: Routes.taskSettings,
    routes: [
      GoRoute(
        path: Routes.taskSettings,
        builder: (_, _) => RepositoryProvider(
          create: (_) => TaskRepository(),
          child: MultiBlocProvider(
            providers: [
              BlocProvider<TaskEstimatesCubit>.value(value: estimates),
              BlocProvider<TaskLabelsCubit>.value(value: labels),
              BlocProvider<TaskPortfolioCubit>.value(value: portfolio),
            ],
            child: TaskSettingsView(permissionsRepository: permissions),
          ),
        ),
      ),
      for (final route in [
        Routes.taskSettingsProjects,
        Routes.taskSettingsInitiatives,
        Routes.taskSettingsLabels,
      ])
        GoRoute(path: route, builder: (_, _) => Text('screen:$route')),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpAppRouter(
    router,
    wrap: (app) => MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<WorkspaceCubit>.value(value: workspaces),
      ],
      child: app,
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

Finder _row(String id) => find.byKey(ValueKey('task-settings-$id'));

Finder _inRow(Finder row, String text) =>
    find.descendant(of: row, matching: find.text(text));

void main() {
  testWidgets('groups Organise and Estimates rows', (tester) async {
    await _pump(tester, canManage: true);

    expect(find.text('Organise'), findsOneWidget);
    expect(find.text('Estimations'), findsOneWidget);
    expect(_inRow(_row('projects'), 'Projects'), findsOneWidget);
    expect(_inRow(_row('projects'), '0'), findsOneWidget);
    expect(_inRow(_row('initiatives'), 'Initiatives'), findsOneWidget);
    expect(_inRow(_row('labels'), 'Labels'), findsOneWidget);
    expect(_inRow(_row('labels'), '2'), findsOneWidget);
    expect(_row('estimate-board-1'), findsOneWidget);
    expect(_row('estimate-board-2'), findsOneWidget);
  });

  testWidgets('shows a board method or Not set', (tester) async {
    await _pump(tester, canManage: true);

    expect(_inRow(_row('estimate-board-1'), 'Product'), findsOneWidget);
    expect(_inRow(_row('estimate-board-1'), 'Fibonacci'), findsOneWidget);
    expect(_inRow(_row('estimate-board-2'), 'Operations'), findsOneWidget);
    expect(_inRow(_row('estimate-board-2'), 'Not set'), findsOneWidget);
  });

  testWidgets('Organise rows open their existing screens', (tester) async {
    final router = await _pump(tester, canManage: true);

    await tester.tap(_row('labels'));
    await tester.pumpAndSettle();
    expect(find.text('screen:${Routes.taskSettingsLabels}'), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    await tester.tap(_row('projects'));
    await tester.pumpAndSettle();
    expect(find.text('screen:${Routes.taskSettingsProjects}'), findsOneWidget);
  });

  testWidgets('managers open the estimate editor for a board', (tester) async {
    await _pump(tester, canManage: true);

    final row = _row('estimate-board-2');
    expect(
      find.descendant(of: row, matching: find.byIcon(AppIcons.forward)),
      findsOneWidget,
    );
    await tester.tap(row);
    await tester.pumpAndSettle();
    expect(find.byType(TaskEstimateDialog), findsOneWidget);
  });

  testWidgets('without manage permission estimate rows are read-only', (
    tester,
  ) async {
    await _pump(tester, canManage: false);

    final row = _row('estimate-board-1');
    expect(row, findsOneWidget);
    expect(
      find.descendant(of: row, matching: find.byType(InkWell)),
      findsNothing,
    );
    expect(
      find.descendant(of: row, matching: find.byIcon(AppIcons.forward)),
      findsNothing,
    );
    // A read-only row has no tap target, so the tap lands on the list.
    await tester.tap(row, warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.byType(TaskEstimateDialog), findsNothing);
    // Organise rows stay reachable.
    expect(
      find.descendant(of: _row('labels'), matching: find.byType(InkWell)),
      findsOneWidget,
    );
  });
}
