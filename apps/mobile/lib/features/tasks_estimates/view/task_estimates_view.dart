import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
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
import 'package:mobile/widgets/fab/fab_action.dart';
import 'package:mobile/widgets/fab/speed_dial_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskEstimatesView extends StatefulWidget {
  const TaskEstimatesView({
    super.key,
    this.permissionsRepository,
  });

  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<TaskEstimatesView> createState() => _TaskEstimatesViewState();
}

class _TaskEstimatesViewState extends State<TaskEstimatesView> {
  static const _tabEstimates = 0;
  static const _tabLabels = 1;
  static const double _fabContentBottomPadding = 96;
  static final Map<String, bool> _permissionCache = {};

  int _activeTab = _tabEstimates;
  late final WorkspacePermissionsRepository _permissionsRepository;
  String? _permissionsWorkspaceId;
  bool _canManageProjects = false;
  bool _isCheckingPermissions = false;
  bool _hasResolvedPermissions = false;

  @override
  void initState() {
    super.initState();
    _permissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == _permissionsWorkspaceId) {
      return;
    }

    _permissionsWorkspaceId = wsId;
    final cachedPermission = wsId == null ? null : _permissionCache[wsId];
    if (cachedPermission != null) {
      _canManageProjects = cachedPermission;
      _hasResolvedPermissions = true;
    } else {
      _canManageProjects = false;
      _hasResolvedPermissions = wsId == null;
    }
    unawaited(_loadPermissions());
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final wsId = state.currentWorkspace?.id;
          if (wsId != null) {
            _permissionsWorkspaceId = wsId;
            unawaited(_loadPermissions());
            unawaited(context.read<TaskEstimatesCubit>().loadBoards(wsId));
            unawaited(context.read<TaskLabelsCubit>().loadLabels(wsId));
          }
        },
        child: Stack(
          children: [
            _buildContent(context),
            if (_canManageProjects)
              SpeedDialFab(
                label: context.l10n.taskPlanningTitle,
                icon: Icons.add,
                actions: [
                  FabAction(
                    icon: Icons.label_outline,
                    label: context.l10n.taskLabelsCreate,
                    onPressed: _openCreateLabel,
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    return BlocBuilder<TaskEstimatesCubit, TaskEstimatesState>(
      builder: (context, estimatesState) {
        return BlocBuilder<TaskLabelsCubit, TaskLabelsState>(
          builder: (context, labelsState) {
            final listBottomPadding =
                _fabContentBottomPadding + MediaQuery.paddingOf(context).bottom;
            final hasVisibleData =
                estimatesState.boards.isNotEmpty ||
                labelsState.labels.isNotEmpty;

            final isEstimatesLoading =
                estimatesState.status == TaskEstimatesStatus.loading &&
                estimatesState.boards.isEmpty;
            final isLabelsLoading =
                labelsState.status == TaskLabelsStatus.loading &&
                labelsState.labels.isEmpty;

            if (_isCheckingPermissions &&
                !_hasResolvedPermissions &&
                !hasVisibleData) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (_hasResolvedPermissions &&
                !_canManageProjects &&
                !hasVisibleData) {
              return const TaskEstimatesAccessDenied();
            }

            if (_activeTab == _tabEstimates && isEstimatesLoading) {
              return const Center(child: NovaLoadingIndicator());
            }
            if (_activeTab == _tabLabels && isLabelsLoading) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (_activeTab == _tabEstimates &&
                estimatesState.status == TaskEstimatesStatus.error &&
                estimatesState.boards.isEmpty) {
              return TaskEstimatesErrorView(error: estimatesState.error);
            }
            if (_activeTab == _tabLabels &&
                labelsState.status == TaskLabelsStatus.error &&
                labelsState.labels.isEmpty) {
              return TaskEstimatesErrorView(error: labelsState.error);
            }

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
                          child: Text(context.l10n.taskEstimatesTitle),
                        ),
                        shad.TabItem(child: Text(context.l10n.taskLabelsTab)),
                      ],
                    ),
                  ),
                  Expanded(
                    child: RefreshIndicator(
                      onRefresh: () => _reload(context),
                      child: ListView(
                        padding: EdgeInsets.fromLTRB(
                          0,
                          12,
                          0,
                          listBottomPadding,
                        ),
                        children: [
                          if (_activeTab == _tabEstimates)
                            TaskEstimateBoardsSection(
                              boards: estimatesState.boards,
                              isUpdating:
                                  estimatesState.status ==
                                  TaskEstimatesStatus.updating,
                            )
                          else
                            TaskLabelsSection(
                              labels: labelsState.labels,
                              isSaving:
                                  labelsState.status == TaskLabelsStatus.saving,
                              onEdit: _openEditLabel,
                              onDelete: _deleteLabel,
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _loadPermissions() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final capturedWsId = wsId;
    final currentUserId = context.read<AuthCubit>().state.user?.id;

    if (!mounted) {
      return;
    }
    setState(() => _isCheckingPermissions = true);

    if (wsId == null || currentUserId == null) {
      if (!_canUpdatePermissionsState(capturedWsId)) {
        return;
      }
      setState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
        _hasResolvedPermissions = true;
      });
      return;
    }

    try {
      final permissions = await _permissionsRepository.getPermissions(
        wsId: wsId,
        userId: currentUserId,
      );

      if (!_canUpdatePermissionsState(capturedWsId)) {
        return;
      }
      setState(() {
        _canManageProjects = permissions.containsPermission('manage_projects');
        _isCheckingPermissions = false;
        _hasResolvedPermissions = true;
      });
      _permissionCache[wsId] = _canManageProjects;
    } on Exception {
      if (!_canUpdatePermissionsState(capturedWsId)) {
        return;
      }
      setState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
        _hasResolvedPermissions = true;
      });
    }
  }

  bool _canUpdatePermissionsState(String? capturedWsId) {
    if (!mounted) {
      return false;
    }

    final currentWsId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    return currentWsId == capturedWsId;
  }

  Future<void> _reload(BuildContext context) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }
    if (_activeTab == _tabLabels) {
      await context.read<TaskLabelsCubit>().loadLabels(
        wsId,
        forceRefresh: true,
      );
      return;
    }
    await context.read<TaskEstimatesCubit>().loadBoards(wsId);
  }

  Future<void> _openCreateLabel() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }

    final rootNavigator = Navigator.of(context, rootNavigator: true);
    final created = await shad.showDialog<bool>(
      context: context,
      builder: (_) => TaskLabelDialog(
        title: context.l10n.taskLabelsCreate,
        submitLabel: context.l10n.taskLabelsCreate,
        onSubmit: (value) async {
          try {
            await context.read<TaskLabelsCubit>().createLabel(
              wsId: wsId,
              name: value.name,
              color: value.color,
            );
            return true;
          } on ApiException catch (error) {
            if (rootNavigator.mounted) {
              shad.showToast(
                context: rootNavigator.context,
                builder: (_, overlay) => shad.Alert.destructive(
                  title: Text(context.l10n.commonSomethingWentWrong),
                  content: Text(error.message),
                ),
              );
            }
            return false;
          } on Exception {
            if (rootNavigator.mounted) {
              shad.showToast(
                context: rootNavigator.context,
                builder: (ctx, overlay) => shad.Alert.destructive(
                  content: Text(ctx.l10n.commonSomethingWentWrong),
                ),
              );
            }
            return false;
          }
        },
      ),
    );

    if (created != true || !mounted || !rootNavigator.mounted) {
      return;
    }

    shad.showToast(
      context: rootNavigator.context,
      builder: (_, overlay) =>
          shad.Alert(content: Text(context.l10n.taskLabelsCreated)),
    );
    setState(() => _activeTab = _tabLabels);
  }

  Future<void> _openEditLabel(TaskLabel label) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }

    final rootNavigator = Navigator.of(context, rootNavigator: true);
    final updated = await shad.showDialog<bool>(
      context: context,
      builder: (_) => TaskLabelDialog(
        title: context.l10n.taskLabelsEdit,
        submitLabel: context.l10n.timerSave,
        initialName: label.name,
        initialColor: label.color,
        onSubmit: (value) async {
          try {
            await context.read<TaskLabelsCubit>().updateLabel(
              wsId: wsId,
              labelId: label.id,
              name: value.name,
              color: value.color,
            );
            return true;
          } on ApiException catch (error) {
            if (rootNavigator.mounted) {
              shad.showToast(
                context: rootNavigator.context,
                builder: (_, overlay) => shad.Alert.destructive(
                  title: Text(context.l10n.commonSomethingWentWrong),
                  content: Text(error.message),
                ),
              );
            }
            return false;
          } on Exception {
            if (rootNavigator.mounted) {
              shad.showToast(
                context: rootNavigator.context,
                builder: (ctx, overlay) => shad.Alert.destructive(
                  content: Text(ctx.l10n.commonSomethingWentWrong),
                ),
              );
            }
            return false;
          }
        },
      ),
    );

    if (updated != true || !mounted || !rootNavigator.mounted) {
      return;
    }

    shad.showToast(
      context: rootNavigator.context,
      builder: (_, overlay) =>
          shad.Alert(content: Text(context.l10n.taskLabelsUpdated)),
    );
  }

  Future<void> _deleteLabel(TaskLabel label) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }

    final rootNavigator = Navigator.of(context, rootNavigator: true);
    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.taskLabelsDelete,
            message: context.l10n.taskLabelsDeleteConfirm,
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.taskLabelsDelete,
            toastContext: rootNavigator.context,
            onConfirm: () {
              return context.read<TaskLabelsCubit>().deleteLabel(
                wsId: wsId,
                labelId: label.id,
              );
            },
          ),
        ) ??
        false;

    if (!deleted || !mounted || !rootNavigator.mounted) {
      return;
    }
    shad.showToast(
      context: rootNavigator.context,
      builder: (_, overlay) =>
          shad.Alert(content: Text(context.l10n.taskLabelsDeleted)),
    );
  }
}
