import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/task_planning/view/task_planning_page.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_labels_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockTaskEstimatesCubit extends MockCubit<TaskEstimatesState>
    implements TaskEstimatesCubit {}

class _MockTaskLabelsCubit extends MockCubit<TaskLabelsState>
    implements TaskLabelsCubit {}

class _MockTaskPortfolioCubit extends MockCubit<TaskPortfolioState>
    implements TaskPortfolioCubit {}

class _MockWorkspacePermissionsRepository extends Mock
    implements WorkspacePermissionsRepository {}

class _FallbackShellProfileCubit extends Cubit<ShellProfileState>
    implements ShellProfileCubit {
  _FallbackShellProfileCubit() : super(const ShellProfileState());

  @override
  void primeFromAuthenticatedUser(dynamic user) {}

  @override
  Future<void> loadFromAuthenticatedUser(
    dynamic user, {
    bool forceRefresh = false,
  }) async {}

  @override
  Future<void> refreshIfStale(dynamic user) async {}

  @override
  Future<void> applyExternalProfile(
    dynamic profile, {
    DateTime? lastUpdatedAt,
    bool isFromCache = false,
  }) async {}

  @override
  Future<void> clear() async {}
}

Future<void> _pumpForTransitions(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

void main() {
  group('TaskPlanningView', () {
    testWidgets('uses shell mini nav for planning modes', (tester) async {
      final authCubit = _MockAuthCubit();
      final workspaceCubit = _MockWorkspaceCubit();
      final estimatesCubit = _MockTaskEstimatesCubit();
      final labelsCubit = _MockTaskLabelsCubit();
      final portfolioCubit = _MockTaskPortfolioCubit();
      final permissionsRepository = _MockWorkspacePermissionsRepository();

      const workspace = Workspace(id: 'ws-1', name: 'Personal', personal: true);
      const workspaceState = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: workspace,
        workspaces: [workspace],
      );
      final estimatesState = TaskEstimatesState(
        status: TaskEstimatesStatus.loaded,
        boards: [
          TaskEstimateBoard(
            id: 'board-1',
            name: 'Tasks',
            createdAt: DateTime(2026, 5, 5),
          ),
        ],
      );

      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: const AuthState.unauthenticated(),
      );
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: workspaceState,
      );
      whenListen(
        estimatesCubit,
        const Stream<TaskEstimatesState>.empty(),
        initialState: estimatesState,
      );
      whenListen(
        labelsCubit,
        const Stream<TaskLabelsState>.empty(),
        initialState: const TaskLabelsState(status: TaskLabelsStatus.loaded),
      );
      whenListen(
        portfolioCubit,
        const Stream<TaskPortfolioState>.empty(),
        initialState: const TaskPortfolioState(
          status: TaskPortfolioStatus.loaded,
          workspaceId: 'ws-1',
        ),
      );

      addTearDown(authCubit.close);
      addTearDown(workspaceCubit.close);
      addTearDown(estimatesCubit.close);
      addTearDown(labelsCubit.close);
      addTearDown(portfolioCubit.close);

      await tester.pumpApp(
        RepositoryProvider(
          create: (_) => TaskRepository(),
          child: MultiBlocProvider(
            providers: [
              BlocProvider<AuthCubit>.value(value: authCubit),
              BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
              BlocProvider<TaskEstimatesCubit>.value(value: estimatesCubit),
              BlocProvider<TaskLabelsCubit>.value(value: labelsCubit),
              BlocProvider<TaskPortfolioCubit>.value(value: portfolioCubit),
              BlocProvider(create: (_) => ShellMiniNavCubit()),
            ],
            child: TaskPlanningView(
              permissionsRepository: permissionsRepository,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(SegmentedButton), findsNothing);

      final miniNavCubit = BlocProvider.of<ShellMiniNavCubit>(
        tester.element(find.byType(TaskPlanningView)),
      );
      var miniNav = miniNavCubit.state.resolveForLocation(Routes.taskPlanning);

      expect(miniNav, isNotNull);
      expect(miniNav!.items.map((item) => item.id), [
        'back',
        'estimates',
        'labels',
        'projects',
        'initiatives',
      ]);
      expect(
        miniNav.items.firstWhere((item) => item.id == 'estimates').selected,
        isTrue,
      );

      miniNav.items
          .firstWhere((item) => item.id == 'projects')
          .onPressed
          ?.call();
      await tester.pumpAndSettle();

      miniNav = miniNavCubit.state.resolveForLocation(Routes.taskPlanning);
      expect(
        miniNav!.items.firstWhere((item) => item.id == 'projects').selected,
        isTrue,
      );
    });

    testWidgets('shell mini nav taps switch planning modes without crashing', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      SharedPreferences.setMockInitialValues(<String, Object>{});

      final appTabCubit = AppTabCubit(settingsRepository: SettingsRepository());
      final authCubit = _MockAuthCubit();
      final workspaceCubit = _MockWorkspaceCubit();
      final estimatesCubit = _MockTaskEstimatesCubit();
      final labelsCubit = _MockTaskLabelsCubit();
      final portfolioCubit = _MockTaskPortfolioCubit();
      final permissionsRepository = _MockWorkspacePermissionsRepository();
      final shellMiniNavCubit = ShellMiniNavCubit();
      final shellTitleOverrideCubit = ShellTitleOverrideCubit();
      final shellProfileCubit = _FallbackShellProfileCubit();

      const workspace = Workspace(id: 'ws-1', name: 'Personal', personal: true);
      const workspaceState = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: workspace,
        workspaces: [workspace],
      );
      final estimatesState = TaskEstimatesState(
        status: TaskEstimatesStatus.loaded,
        boards: [
          TaskEstimateBoard(
            id: 'board-1',
            name: 'Tasks',
            createdAt: DateTime(2026, 5, 5),
          ),
        ],
      );

      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: const AuthState.unauthenticated(),
      );
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: workspaceState,
      );
      whenListen(
        estimatesCubit,
        const Stream<TaskEstimatesState>.empty(),
        initialState: estimatesState,
      );
      whenListen(
        labelsCubit,
        const Stream<TaskLabelsState>.empty(),
        initialState: const TaskLabelsState(status: TaskLabelsStatus.loaded),
      );
      whenListen(
        portfolioCubit,
        const Stream<TaskPortfolioState>.empty(),
        initialState: const TaskPortfolioState(
          status: TaskPortfolioStatus.loaded,
          workspaceId: 'ws-1',
        ),
      );

      addTearDown(appTabCubit.close);
      addTearDown(authCubit.close);
      addTearDown(workspaceCubit.close);
      addTearDown(estimatesCubit.close);
      addTearDown(labelsCubit.close);
      addTearDown(portfolioCubit.close);
      addTearDown(shellMiniNavCubit.close);
      addTearDown(shellTitleOverrideCubit.close);
      addTearDown(shellProfileCubit.close);

      final router = GoRouter(
        initialLocation: Routes.taskPlanning,
        routes: [
          ShellRoute(
            builder: (context, state, child) => BlocProvider(
              create: (_) => AssistantChromeCubit(),
              child: ShellPage(
                matchedLocation: state.uri.path,
                enableDebugLogs: false,
                child: child,
              ),
            ),
            routes: [
              GoRoute(
                path: Routes.tasks,
                builder: (context, state) =>
                    const Center(child: Text('tasks-root')),
              ),
              GoRoute(
                path: Routes.taskPlanning,
                builder: (context, state) => RepositoryProvider(
                  create: (_) => TaskRepository(),
                  child: MultiBlocProvider(
                    providers: [
                      BlocProvider<TaskEstimatesCubit>.value(
                        value: estimatesCubit,
                      ),
                      BlocProvider<TaskLabelsCubit>.value(value: labelsCubit),
                      BlocProvider<TaskPortfolioCubit>.value(
                        value: portfolioCubit,
                      ),
                    ],
                    child: TaskPlanningView(
                      permissionsRepository: permissionsRepository,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        MultiBlocProvider(
          providers: [
            BlocProvider.value(value: appTabCubit),
            BlocProvider<AuthCubit>.value(value: authCubit),
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            BlocProvider.value(value: shellMiniNavCubit),
            BlocProvider.value(value: shellTitleOverrideCubit),
            BlocProvider<ShellProfileCubit>.value(value: shellProfileCubit),
          ],
          child: shad.ShadcnApp.router(
            theme: const shad.ThemeData(
              colorScheme: shad.ColorSchemes.lightZinc,
            ),
            darkTheme: const shad.ThemeData.dark(
              colorScheme: shad.ColorSchemes.darkZinc,
            ),
            localizationsDelegates: const [
              ...AppLocalizations.localizationsDelegates,
              shad.ShadcnLocalizations.delegate,
            ],
            supportedLocales: AppLocalizations.supportedLocales,
            routerConfig: router,
          ),
        ),
      );
      await _pumpForTransitions(tester);

      expect(tester.takeException(), isNull);
      expect(
        find.byKey(
          const ValueKey<String>(
            'injected-mini-nav-task-planning-mini-nav-estimates',
          ),
        ),
        findsOneWidget,
      );
      expect(find.text('Estimations'), findsOneWidget);
      expect(find.text('Labels'), findsNothing);
      expect(find.text('Projects'), findsNothing);
      expect(find.text('Initiatives'), findsNothing);
      expect(find.bySemanticsLabel('Labels'), findsOneWidget);
      expect(find.bySemanticsLabel('Projects'), findsOneWidget);
      expect(find.bySemanticsLabel('Initiatives'), findsOneWidget);
      expect(find.text('Boards'), findsNothing);
      expect(
        shellMiniNavCubit.state
            .resolveForLocation(Routes.taskPlanning)
            ?.items
            .firstWhere((item) => item.id == 'estimates')
            .selected,
        isTrue,
      );

      await tester.tap(
        find.byKey(
          const ValueKey<String>(
            'injected-mini-nav-task-planning-mini-nav-projects',
          ),
        ),
      );
      await _pumpForTransitions(tester);
      expect(tester.takeException(), isNull);
      expect(find.text('Projects'), findsOneWidget);
      expect(
        shellMiniNavCubit.state
            .resolveForLocation(Routes.taskPlanning)
            ?.items
            .firstWhere((item) => item.id == 'projects')
            .selected,
        isTrue,
      );

      await tester.tap(
        find.byKey(
          const ValueKey<String>(
            'injected-mini-nav-task-planning-mini-nav-initiatives',
          ),
        ),
      );
      await _pumpForTransitions(tester);
      expect(tester.takeException(), isNull);
      expect(find.text('Initiatives'), findsOneWidget);
      expect(
        shellMiniNavCubit.state
            .resolveForLocation(Routes.taskPlanning)
            ?.items
            .firstWhere((item) => item.id == 'initiatives')
            .selected,
        isTrue,
      );

      await tester.tap(
        find.byKey(
          const ValueKey<String>(
            'injected-mini-nav-task-planning-mini-nav-back',
          ),
        ),
      );
      await _pumpForTransitions(tester);
      expect(tester.takeException(), isNull);
      expect(router.routeInformationProvider.value.uri.path, Routes.tasks);
    });
  });
}
