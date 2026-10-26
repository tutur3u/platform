import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/task_portfolio/view/task_project_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _TaskRepository extends Mock implements TaskRepository {}

class _Portfolio extends MockCubit<TaskPortfolioState>
    implements TaskPortfolioCubit {}

const _workspace = Workspace(id: 'ws-1', name: 'Platform');

/// Mounts the project page beside the shell title and mini-nav cubits.
Future<({ShellTitleOverrideCubit titles, ShellMiniNavCubit miniNav})>
_mountProjectPage(
  WidgetTester tester, {
  TaskPortfolioCubit Function(TaskRepository repository)? createCubit,
}) async {
  final auth = _Auth();
  final workspaces = _Workspace();
  final titles = ShellTitleOverrideCubit();
  final miniNav = ShellMiniNavCubit();
  addTearDown(titles.close);
  addTearDown(miniNav.close);
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: const AuthState.unknown(),
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

  await tester.pumpApp(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<WorkspaceCubit>.value(value: workspaces),
        BlocProvider.value(value: titles),
        BlocProvider.value(value: miniNav),
      ],
      child: TaskProjectDetailPage(
        projectId: 'project-1',
        repository: _TaskRepository(),
        createCubit: createCubit,
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return (titles: titles, miniNav: miniNav);
}

void main() {
  testWidgets('project detail publishes its title and Back to the shell', (
    tester,
  ) async {
    final (:titles, :miniNav) = await _mountProjectPage(tester);

    final location = Routes.taskPortfolioProjectPath('project-1');
    // No in-body top bar or Back button; the shell owns both.
    expect(find.byType(MobileSectionAppBar), findsNothing);
    expect(find.byIcon(Icons.arrow_back), findsNothing);
    // Until the project resolves, the shell shows the portfolio title.
    expect(titles.state.resolveForLocation(location), 'Portfolio');
    // Dock/rail Back returns to the portfolio, including from deep links.
    expect(
      miniNav.state.deepLinkBackRouteForLocation(location),
      Routes.taskPortfolio,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('the resolved project name reaches the shell title', (
    tester,
  ) async {
    final portfolio = _Portfolio();
    whenListen(
      portfolio,
      const Stream<TaskPortfolioState>.empty(),
      initialState: TaskPortfolioState(
        status: TaskPortfolioStatus.loaded,
        workspaceId: _workspace.id,
        projects: [
          TaskProjectSummary(
            id: 'project-1',
            name: '  Launch plan  ',
            wsId: _workspace.id,
            creatorId: 'user-1',
            createdAt: DateTime.utc(2030),
            tasksCount: 0,
            completedTasksCount: 0,
            linkedTasks: const [],
          ),
        ],
      ),
    );
    when(() => portfolio.load(any())).thenAnswer((_) async {});

    final (:titles, miniNav: _) = await _mountProjectPage(
      tester,
      createCubit: (_) => portfolio,
    );

    expect(
      titles.state.resolveForLocation(
        Routes.taskPortfolioProjectPath('project-1'),
      ),
      'Launch plan',
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
