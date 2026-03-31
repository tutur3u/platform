import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/task_portfolio/view/task_portfolio_view.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockTaskPortfolioCubit extends MockCubit<TaskPortfolioState>
    implements TaskPortfolioCubit {}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockWorkspacePermissionsRepository extends Mock
    implements WorkspacePermissionsRepository {}

void main() {
  group('TaskPortfolioView', () {
    late _MockTaskPortfolioCubit taskPortfolioCubit;
    late _MockWorkspaceCubit workspaceCubit;
    late _MockWorkspacePermissionsRepository permissionsRepository;

    setUp(() {
      taskPortfolioCubit = _MockTaskPortfolioCubit();
      workspaceCubit = _MockWorkspaceCubit();
      permissionsRepository = _MockWorkspacePermissionsRepository();
    });

    testWidgets(
      'opens initiative project management dialog from the real view',
      (tester) async {
        const workspace = Workspace(id: 'ws-1', name: 'Platform');
        const workspaceState = WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: workspace,
          workspaces: [workspace],
        );
        final portfolioState = TaskPortfolioState(
          status: TaskPortfolioStatus.loaded,
          workspaceId: 'ws-1',
          projects: [
            TaskProjectSummary(
              id: 'project-2',
              name: 'Project Beta',
              wsId: 'ws-1',
              creatorId: 'user-1',
              createdAt: DateTime(2026, 3),
              tasksCount: 0,
              completedTasksCount: 0,
              linkedTasks: const [],
              priority: 'normal',
            ),
          ],
          initiatives: [
            TaskInitiativeSummary(
              id: 'initiative-1',
              name: 'North Star',
              createdAt: DateTime(2026, 3),
              projectsCount: 1,
              linkedProjects: const [
                TaskInitiativeLinkedProject(
                  id: 'project-1',
                  name: 'Project Alpha',
                ),
              ],
            ),
          ],
        );

        whenListen(
          workspaceCubit,
          const Stream<WorkspaceState>.empty(),
          initialState: workspaceState,
        );
        whenListen(
          taskPortfolioCubit,
          const Stream<TaskPortfolioState>.empty(),
          initialState: portfolioState,
        );
        when(
          () => permissionsRepository.getPermissions(wsId: 'ws-1'),
        ).thenAnswer(
          (_) async => const WorkspacePermissions(
            permissions: {'manage_projects'},
            isCreator: false,
          ),
        );

        await tester.pumpApp(
          MultiBlocProvider(
            providers: [
              BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
              BlocProvider<TaskPortfolioCubit>.value(value: taskPortfolioCubit),
              BlocProvider(create: (_) => ShellMiniNavCubit()),
            ],
            child: TaskPortfolioView(
              permissionsRepository: permissionsRepository,
            ),
          ),
        );
        await tester.pumpAndSettle();

        final miniNavCubit = BlocProvider.of<ShellMiniNavCubit>(
          tester.element(find.byType(TaskPortfolioView)),
        );
        final miniNav = miniNavCubit.state.resolveForLocation(
          Routes.taskPortfolio,
        );
        expect(miniNav, isNotNull);

        miniNav!.items
            .firstWhere((item) => item.id == 'initiatives')
            .onPressed
            ?.call();
        await tester.pumpAndSettle();

        await tester.tap(find.text('Manage projects'));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.text('Linked projects'), findsOneWidget);
        expect(find.text('Project Alpha'), findsWidgets);
        expect(find.text('Link project'), findsWidgets);
        expect(find.text('Select project'), findsOneWidget);
      },
    );
  });
}
