import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_dialogs.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskPortfolioActions {
  const TaskPortfolioActions({
    required this.context,
    required this.taskRepository,
  });

  final BuildContext context;
  final TaskRepository taskRepository;

  Future<void> openCreateProject() async {
    final result = await shad.showDialog<TaskProjectFormValue>(
      context: context,
      builder: (_) => const TaskProjectDialog(),
    );
    if (result == null || !context.mounted) return;

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

  Future<void> openEditProject(TaskProjectSummary project) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    List<WorkspaceUserOption> workspaceUsers;
    try {
      workspaceUsers = await taskRepository.getWorkspaceUsers(wsId);
    } on ApiException catch (error) {
      if (context.mounted) {
        _showErrorToast(
          error.message.trim().isEmpty
              ? context.l10n.commonSomethingWentWrong
              : error.message,
        );
      }
      return;
    } on Exception {
      if (context.mounted) {
        _showErrorToast(context.l10n.commonSomethingWentWrong);
      }
      return;
    }

    if (!context.mounted) return;

    final result = await shad.showDialog<TaskProjectFormValue>(
      context: context,
      builder: (_) =>
          TaskProjectDialog(project: project, workspaceUsers: workspaceUsers),
    );
    if (result == null || !context.mounted) return;

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

  Future<void> deleteProject(TaskProjectSummary project) async {
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

    if (deleted && context.mounted) {
      _showSuccessToast(context.l10n.taskPortfolioProjectDeleted);
    }
  }

  Future<void> openCreateInitiative() async {
    final result = await shad.showDialog<TaskInitiativeFormValue>(
      context: context,
      builder: (_) => const TaskInitiativeDialog(),
    );
    if (result == null || !context.mounted) return;

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

  Future<void> openEditInitiative(TaskInitiativeSummary initiative) async {
    final result = await shad.showDialog<TaskInitiativeFormValue>(
      context: context,
      builder: (_) => TaskInitiativeDialog(initiative: initiative),
    );
    if (result == null || !context.mounted) return;

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

  Future<void> deleteInitiative(TaskInitiativeSummary initiative) async {
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

    if (deleted && context.mounted) {
      _showSuccessToast(context.l10n.taskPortfolioInitiativeDeleted);
    }
  }

  Future<void> manageInitiativeProjects(
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
      if (context.mounted) {
        _showSuccessToast(successMessage);
      }
    } on ApiException catch (error) {
      if (context.mounted) {
        _showErrorToast(
          error.message.trim().isEmpty
              ? context.l10n.commonSomethingWentWrong
              : error.message,
        );
      }
    } on Exception {
      if (context.mounted) {
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
