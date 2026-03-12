import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/task_portfolio/view/task_portfolio_actions.dart';
import 'package:mobile/features/task_portfolio/view/task_portfolio_permissions_controller.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_cards.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_feedback.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/fab/fab_action.dart';
import 'package:mobile/widgets/fab/speed_dial_fab.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskPortfolioView extends StatefulWidget {
  const TaskPortfolioView({
    super.key,
    this.permissionsRepository,
    this.taskRepository,
  });

  final WorkspacePermissionsRepository? permissionsRepository;
  final TaskRepository? taskRepository;

  @override
  State<TaskPortfolioView> createState() => _TaskPortfolioViewState();
}

class _TaskPortfolioViewState extends State<TaskPortfolioView> {
  static const _tabProjects = 0;
  static const double _fabContentBottomPadding = 96;

  int _activeTab = _tabProjects;
  late final TaskPortfolioPermissionsController _permissionsController;
  late final TaskRepository _taskRepository;

  TaskPortfolioActions get _actions => TaskPortfolioActions(
    context: context,
    taskRepository: _taskRepository,
  );

  @override
  void initState() {
    super.initState();
    _taskRepository = widget.taskRepository ?? TaskRepository();
    _permissionsController = TaskPortfolioPermissionsController(
      permissionsRepository:
          widget.permissionsRepository ?? WorkspacePermissionsRepository(),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (!_permissionsController.shouldReloadForWorkspace(wsId)) return;

    unawaited(_loadPermissions());
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      headers: [
        MobileSectionAppBar(title: context.l10n.taskPortfolioTitle),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final wsId = state.currentWorkspace?.id;
          if (wsId != null) {
            unawaited(context.read<TaskPortfolioCubit>().load(wsId));
          }
        },
        child: Stack(
          children: [
            _buildContent(context),
            if (_permissionsController.canManageProjects)
              SpeedDialFab(
                label: context.l10n.taskPortfolioTitle,
                icon: Icons.add,
                actions: [
                  FabAction(
                    icon: Icons.folder_open_outlined,
                    label: context.l10n.taskPortfolioCreateProject,
                    onPressed: _openCreateProject,
                  ),
                  FabAction(
                    icon: Icons.account_tree_outlined,
                    label: context.l10n.taskPortfolioCreateInitiative,
                    onPressed: _openCreateInitiative,
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    if (_permissionsController.isCheckingPermissions) {
      return const Center(child: shad.CircularProgressIndicator());
    }
    if (!_permissionsController.canManageProjects) {
      return const TaskPortfolioAccessDenied();
    }

    return BlocBuilder<TaskPortfolioCubit, TaskPortfolioState>(
      builder: (context, state) {
        if (state.status == TaskPortfolioStatus.loading &&
            state.projects.isEmpty &&
            state.initiatives.isEmpty) {
          return const Center(child: shad.CircularProgressIndicator());
        }
        if (state.status == TaskPortfolioStatus.error &&
            state.projects.isEmpty &&
            state.initiatives.isEmpty) {
          return TaskPortfolioErrorView(error: state.error);
        }

        final listBottomPadding =
            _fabContentBottomPadding + MediaQuery.paddingOf(context).bottom;

        return ResponsiveWrapper(
          maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: shad.Tabs(
                  index: _activeTab,
                  onChanged: (value) => setState(() => _activeTab = value),
                  children: [
                    shad.TabItem(
                      child: Text(context.l10n.taskPortfolioProjectsTab),
                    ),
                    shad.TabItem(
                      child: Text(context.l10n.taskPortfolioInitiativesTab),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _reload,
                  child: _activeTab == _tabProjects
                      ? _buildProjectsList(context, state, listBottomPadding)
                      : _buildInitiativesList(
                          context,
                          state,
                          listBottomPadding,
                        ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildProjectsList(
    BuildContext context,
    TaskPortfolioState state,
    double bottomPadding,
  ) {
    if (state.projects.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 8, 16, bottomPadding),
        children: [
          TaskPortfolioEmptyState(
            icon: Icons.folder_open_outlined,
            title: context.l10n.taskPortfolioProjectsEmptyTitle,
            description: context.l10n.taskPortfolioProjectsEmptyDescription,
          ),
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 8, 16, bottomPadding),
      itemCount: state.projects.length,
      separatorBuilder: (_, _) => const shad.Gap(12),
      itemBuilder: (context, index) {
        final project = state.projects[index];
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => context.push(
            Routes.taskPortfolioProjectPath(project.id),
          ),
          child: TaskProjectCard(
            project: project,
            onEdit: () => _openEditProject(project),
            onDelete: () => _deleteProject(project),
          ),
        );
      },
    );
  }

  Widget _buildInitiativesList(
    BuildContext context,
    TaskPortfolioState state,
    double bottomPadding,
  ) {
    if (state.initiatives.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 8, 16, bottomPadding),
        children: [
          TaskPortfolioEmptyState(
            icon: Icons.account_tree_outlined,
            title: context.l10n.taskPortfolioInitiativesEmptyTitle,
            description: context.l10n.taskPortfolioInitiativesEmptyDescription,
          ),
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 8, 16, bottomPadding),
      itemCount: state.initiatives.length,
      separatorBuilder: (_, _) => const shad.Gap(12),
      itemBuilder: (context, index) {
        final initiative = state.initiatives[index];
        return TaskInitiativeCard(
          initiative: initiative,
          onEdit: () => _openEditInitiative(initiative),
          onDelete: () => _deleteInitiative(initiative),
          onManageProjects: () => _manageInitiativeProjects(initiative),
        );
      },
    );
  }

  Future<void> _loadPermissions() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (!mounted) return;

    final loadFuture = _permissionsController.loadPermissions(wsId: wsId);
    setState(() {});
    await loadFuture;
    if (!mounted) return;
    setState(() {});
  }

  Future<void> _reload() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await context.read<TaskPortfolioCubit>().load(wsId);
  }

  Future<void> _openCreateProject() async {
    await _actions.openCreateProject();
  }

  Future<void> _openEditProject(TaskProjectSummary project) async {
    await _actions.openEditProject(project);
  }

  Future<void> _deleteProject(TaskProjectSummary project) async {
    await _actions.deleteProject(project);
  }

  Future<void> _openCreateInitiative() async {
    await _actions.openCreateInitiative();
  }

  Future<void> _openEditInitiative(TaskInitiativeSummary initiative) async {
    await _actions.openEditInitiative(initiative);
  }

  Future<void> _deleteInitiative(TaskInitiativeSummary initiative) async {
    await _actions.deleteInitiative(initiative);
  }

  Future<void> _manageInitiativeProjects(
    TaskInitiativeSummary initiative,
  ) async {
    await _actions.manageInitiativeProjects(initiative);
  }
}
