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
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_cards.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_dialogs.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_feedback.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/fab/fab_action.dart';
import 'package:mobile/widgets/fab/speed_dial_fab.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskPortfolioView extends StatefulWidget {
  TaskPortfolioView({
    WorkspacePermissionsRepository? permissionsRepository,
    TaskRepository? taskRepository,
    super.key,
  }) : permissionsRepository =
           permissionsRepository ?? WorkspacePermissionsRepository(),
       taskRepository = taskRepository ?? TaskRepository();

  final WorkspacePermissionsRepository permissionsRepository;
  final TaskRepository taskRepository;

  @override
  State<TaskPortfolioView> createState() => _TaskPortfolioViewState();
}

class _TaskPortfolioViewState extends State<TaskPortfolioView> {
  static const _tabProjects = 0;
  static const double _fabContentBottomPadding = 96;

  int _activeTab = _tabProjects;
  String? _permissionsWorkspaceId;
  bool _canManageProjects = false;
  bool _isCheckingPermissions = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == _permissionsWorkspaceId) return;

    _permissionsWorkspaceId = wsId;
    unawaited(_loadPermissions());
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      headers: [
        shad.AppBar(
          leading: [
            shad.OutlineButton(
              density: shad.ButtonDensity.icon,
              onPressed: () {
                final router = GoRouter.of(context);
                if (router.canPop()) {
                  router.pop();
                  return;
                }
                context.go(Routes.tasks);
              },
              child: const Icon(Icons.arrow_back),
            ),
          ],
          title: Text(context.l10n.taskPortfolioTitle),
        ),
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
            if (_canManageProjects)
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
    if (_isCheckingPermissions) {
      return const Center(child: shad.CircularProgressIndicator());
    }
    if (!_canManageProjects) {
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
        return TaskProjectCard(
          project: project,
          onEdit: () => _openEditProject(project),
          onDelete: () => _deleteProject(project),
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

    setState(() => _isCheckingPermissions = true);

    if (wsId == null) {
      setState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
      });
      return;
    }

    try {
      final permissions = await widget.permissionsRepository.getPermissions(
        wsId: wsId,
      );
      if (!mounted) return;
      setState(() {
        _canManageProjects = permissions.containsPermission('manage_projects');
        _isCheckingPermissions = false;
      });
    } on Exception {
      if (!mounted) return;
      setState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
      });
    }
  }

  Future<void> _reload() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await context.read<TaskPortfolioCubit>().load(wsId);
  }

  Future<void> _openCreateProject() async {
    final result = await shad.showDialog<TaskProjectFormValue>(
      context: context,
      builder: (_) => const TaskProjectDialog(),
    );
    if (result == null || !mounted) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    await _runAction(
      () => context.read<TaskPortfolioCubit>().createProject(
        wsId: wsId,
        name: result.name,
        description: result.description,
      ),
      successMessage: context.l10n.taskPortfolioProjectCreated,
    );
  }

  Future<void> _openEditProject(TaskProjectSummary project) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    List<WorkspaceUserOption> workspaceUsers;
    try {
      workspaceUsers = await widget.taskRepository.getWorkspaceUsers(wsId);
    } on ApiException catch (error) {
      if (mounted) {
        _showErrorToast(
          error.message.trim().isEmpty
              ? context.l10n.commonSomethingWentWrong
              : error.message,
        );
      }
      return;
    } on Exception {
      if (mounted) {
        _showErrorToast(context.l10n.commonSomethingWentWrong);
      }
      return;
    }

    if (!mounted) return;

    final result = await shad.showDialog<TaskProjectFormValue>(
      context: context,
      builder: (_) =>
          TaskProjectDialog(project: project, workspaceUsers: workspaceUsers),
    );
    if (result == null || !mounted) return;

    await _runAction(
      () => context.read<TaskPortfolioCubit>().updateProject(
        wsId: wsId,
        projectId: project.id,
        name: result.name,
        description: result.description,
        status: result.status,
        priority: result.priority,
        healthStatus: result.healthStatus,
        leadId: result.leadId,
        startDate: result.startDate,
        endDate: result.endDate,
        archived: result.archived,
      ),
      successMessage: context.l10n.taskPortfolioProjectUpdated,
    );
  }

  Future<void> _deleteProject(TaskProjectSummary project) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.taskPortfolioDeleteProject,
            message: context.l10n.taskPortfolioDeleteProjectConfirm,
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.taskPortfolioDeleteProject,
            toastContext: toastContext,
            onConfirm: () async {
              await context.read<TaskPortfolioCubit>().deleteProject(
                wsId: wsId,
                projectId: project.id,
              );
            },
          ),
        ) ??
        false;

    if (deleted && mounted) {
      _showSuccessToast(context.l10n.taskPortfolioProjectDeleted);
    }
  }

  Future<void> _openCreateInitiative() async {
    final result = await shad.showDialog<TaskInitiativeFormValue>(
      context: context,
      builder: (_) => const TaskInitiativeDialog(),
    );
    if (result == null || !mounted) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    await _runAction(
      () => context.read<TaskPortfolioCubit>().createInitiative(
        wsId: wsId,
        name: result.name,
        description: result.description,
        status: result.status,
      ),
      successMessage: context.l10n.taskPortfolioInitiativeCreated,
    );
  }

  Future<void> _openEditInitiative(TaskInitiativeSummary initiative) async {
    final result = await shad.showDialog<TaskInitiativeFormValue>(
      context: context,
      builder: (_) => TaskInitiativeDialog(initiative: initiative),
    );
    if (result == null || !mounted) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    await _runAction(
      () => context.read<TaskPortfolioCubit>().updateInitiative(
        wsId: wsId,
        initiativeId: initiative.id,
        name: result.name,
        description: result.description,
        status: result.status,
      ),
      successMessage: context.l10n.taskPortfolioInitiativeUpdated,
    );
  }

  Future<void> _deleteInitiative(TaskInitiativeSummary initiative) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.taskPortfolioDeleteInitiative,
            message: context.l10n.taskPortfolioDeleteInitiativeConfirm,
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.taskPortfolioDeleteInitiative,
            toastContext: toastContext,
            onConfirm: () async {
              await context.read<TaskPortfolioCubit>().deleteInitiative(
                wsId: wsId,
                initiativeId: initiative.id,
              );
            },
          ),
        ) ??
        false;

    if (deleted && mounted) {
      _showSuccessToast(context.l10n.taskPortfolioInitiativeDeleted);
    }
  }

  Future<void> _manageInitiativeProjects(
    TaskInitiativeSummary initiative,
  ) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final taskPortfolioCubit = context.read<TaskPortfolioCubit>();

    await shad.showDialog<void>(
      context: context,
      builder: (_) => BlocProvider.value(
        value: taskPortfolioCubit,
        child: BlocBuilder<TaskPortfolioCubit, TaskPortfolioState>(
          builder: (dialogContext, state) {
            final refreshed = state.initiatives.firstWhere(
              (item) => item.id == initiative.id,
              orElse: () => initiative,
            );
            final linkedIds = refreshed.linkedProjects
                .map((item) => item.id)
                .toSet();
            final availableProjects = state.projects
                .where((project) => !linkedIds.contains(project.id))
                .toList(growable: false);

            return ManageInitiativeProjectsDialog(
              initiative: refreshed,
              availableProjects: availableProjects,
              isMutating: state.isMutating,
              onLink: (projectId) => _runAction(
                () => dialogContext
                    .read<TaskPortfolioCubit>()
                    .linkProjectToInitiative(
                      wsId: wsId,
                      initiativeId: initiative.id,
                      projectId: projectId,
                    ),
                successMessage: context.l10n.taskPortfolioProjectLinked,
              ),
              onUnlink: (projectId) => _runAction(
                () => dialogContext
                    .read<TaskPortfolioCubit>()
                    .unlinkProjectFromInitiative(
                      wsId: wsId,
                      initiativeId: initiative.id,
                      projectId: projectId,
                    ),
                successMessage: context.l10n.taskPortfolioProjectUnlinked,
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _runAction(
    Future<void> Function() action, {
    required String successMessage,
  }) async {
    try {
      await action();
      if (mounted) {
        _showSuccessToast(successMessage);
      }
    } on ApiException catch (error) {
      if (mounted) {
        _showErrorToast(
          error.message.trim().isEmpty
              ? context.l10n.commonSomethingWentWrong
              : error.message,
        );
      }
    } on Exception {
      if (mounted) {
        _showErrorToast(context.l10n.commonSomethingWentWrong);
      }
    }
  }

  void _showSuccessToast(String message) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert(content: Text(message)),
    );
  }

  void _showErrorToast(String message) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) =>
          shad.Alert.destructive(content: Text(message)),
    );
  }
}
