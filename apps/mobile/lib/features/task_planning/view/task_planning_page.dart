import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/task_portfolio/view/task_portfolio_actions.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_cards.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_feedback.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_labels_cubit.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimate_boards_section.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimates_feedback.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_label_dialog.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_labels_section.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'task_planning_actions.dart';
part 'task_planning_content.dart';
part 'task_planning_navigation.dart';

class TaskPlanningPage extends StatelessWidget {
  const TaskPlanningPage({
    super.key,
    this.repository,
    this.permissionsRepository,
  });

  final TaskRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  Widget build(BuildContext context) {
    unawaited(CacheWarmupCoordinator.instance.prewarmModule('tasks'));
    return RepositoryProvider<TaskRepository>(
      create: (_) => repository ?? TaskRepository(),
      child: MultiBlocProvider(
        providers: [
          BlocProvider(
            create: (context) {
              final wsId = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              final cubit = TaskEstimatesCubit(
                taskRepository: context.read<TaskRepository>(),
                initialState: wsId == null
                    ? null
                    : TaskEstimatesCubit.seedStateFor(wsId),
              );
              if (wsId != null) {
                unawaited(cubit.loadBoards(wsId));
              }
              return cubit;
            },
          ),
          BlocProvider(
            create: (context) {
              final wsId = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              final cubit = TaskLabelsCubit(
                taskRepository: context.read<TaskRepository>(),
                initialState: wsId == null
                    ? null
                    : TaskLabelsCubit.seedStateFor(wsId),
              );
              if (wsId != null) {
                unawaited(cubit.loadLabels(wsId));
              }
              return cubit;
            },
          ),
          BlocProvider(
            create: (context) {
              final wsId = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              final cubit = TaskPortfolioCubit(
                taskRepository: context.read<TaskRepository>(),
                initialState: wsId == null
                    ? null
                    : TaskPortfolioCubit.seedStateFor(wsId),
              );
              if (wsId != null) {
                unawaited(cubit.load(wsId));
              }
              return cubit;
            },
          ),
        ],
        child: TaskPlanningView(permissionsRepository: permissionsRepository),
      ),
    );
  }
}

enum _TaskPlanningTab { estimates, labels, projects, initiatives }

class TaskPlanningView extends StatefulWidget {
  const TaskPlanningView({super.key, this.permissionsRepository});

  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<TaskPlanningView> createState() => _TaskPlanningViewState();
}

class _TaskPlanningViewState extends State<TaskPlanningView> {
  static const double _fabContentBottomPadding = 96;

  _TaskPlanningTab _activeTab = _TaskPlanningTab.estimates;
  late final WorkspacePermissionsRepository _permissionsRepository;
  late final TaskRepository _taskRepository;
  String? _permissionsWorkspaceId;
  bool _canManageProjects = false;
  bool _isCheckingPermissions = false;
  bool _hasResolvedPermissions = false;

  TaskPortfolioActions get _portfolioActions =>
      TaskPortfolioActions(context: context, taskRepository: _taskRepository);

  void _updateState(VoidCallback update) {
    if (!mounted) return;
    setState(update);
  }

  void _selectTab(_TaskPlanningTab tab) {
    _updateState(() => _activeTab = tab);
  }

  @override
  void initState() {
    super.initState();
    _permissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
    _taskRepository = context.read<TaskRepository>();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId != _permissionsWorkspaceId) {
      _permissionsWorkspaceId = wsId;
      _canManageProjects = false;
      _hasResolvedPermissions = wsId == null;
      unawaited(_loadPermissions());
    }
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: MultiBlocListener(
        listeners: [
          BlocListener<WorkspaceCubit, WorkspaceState>(
            listenWhen: (prev, curr) =>
                prev.currentWorkspace?.id != curr.currentWorkspace?.id,
            listener: (context, state) {
              final wsId = state.currentWorkspace?.id;
              _permissionsWorkspaceId = wsId;
              _canManageProjects = false;
              _hasResolvedPermissions = wsId == null;
              unawaited(_loadPermissions());
              if (wsId == null) return;
              unawaited(context.read<TaskEstimatesCubit>().loadBoards(wsId));
              unawaited(context.read<TaskLabelsCubit>().loadLabels(wsId));
              unawaited(context.read<TaskPortfolioCubit>().load(wsId));
            },
          ),
          BlocListener<AuthCubit, AuthState>(
            listenWhen: (previous, current) =>
                previous.user?.id != current.user?.id,
            listener: (context, state) {
              final wsId = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              _permissionsWorkspaceId = wsId;
              _canManageProjects = false;
              _hasResolvedPermissions = wsId == null;
              unawaited(_loadPermissions());
              if (wsId == null) return;
              unawaited(context.read<TaskEstimatesCubit>().loadBoards(wsId));
              unawaited(
                context.read<TaskLabelsCubit>().loadLabels(
                  wsId,
                  forceRefresh: true,
                ),
              );
              unawaited(
                context.read<TaskPortfolioCubit>().load(
                  wsId,
                  forceRefresh: true,
                ),
              );
            },
          ),
        ],
        child: Stack(
          children: [
            _buildContent(context),
            _buildPlanningMiniNav(context),
            if (_canManageProjects && _activeTab == _TaskPlanningTab.labels)
              ExtendedFab(
                label: context.l10n.taskLabelsCreate,
                icon: Icons.label_outline,
                onPressed: _openCreateLabel,
                includeBottomSafeArea: false,
              ),
            if (_canManageProjects && _activeTab == _TaskPlanningTab.projects)
              ExtendedFab(
                label: context.l10n.taskPortfolioCreateProject,
                icon: Icons.folder_open_outlined,
                onPressed: _openCreateProject,
                includeBottomSafeArea: false,
              ),
            if (_canManageProjects &&
                _activeTab == _TaskPlanningTab.initiatives)
              ExtendedFab(
                label: context.l10n.taskPortfolioCreateInitiative,
                icon: Icons.account_tree_outlined,
                onPressed: _openCreateInitiative,
                includeBottomSafeArea: false,
              ),
          ],
        ),
      ),
    );
  }
}
