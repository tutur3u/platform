import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
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
    _canManageProjects = false;
    _hasResolvedPermissions = wsId == null;
    unawaited(_loadPermissions());
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
              if (wsId != null) {
                _permissionsWorkspaceId = wsId;
                _canManageProjects = false;
                _hasResolvedPermissions = false;
                unawaited(_loadPermissions());
                unawaited(context.read<TaskEstimatesCubit>().loadBoards(wsId));
                unawaited(context.read<TaskLabelsCubit>().loadLabels(wsId));
              }
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
              if (wsId == null || wsId.isEmpty) {
                return;
              }
              _permissionsWorkspaceId = wsId;
              _canManageProjects = false;
              _hasResolvedPermissions = false;
              unawaited(_loadPermissions());
              unawaited(context.read<TaskEstimatesCubit>().loadBoards(wsId));
              unawaited(
                context.read<TaskLabelsCubit>().loadLabels(
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
            ShellMiniNav(
              ownerId: 'task-estimates-mini-nav',
              locations: const {Routes.taskEstimates},
              deepLinkBackRoute: Routes.tasks,
              items: [
                ShellMiniNavItemSpec(
                  id: 'back',
                  icon: Icons.chevron_left,
                  label: context.l10n.navBack,
                  callbackToken: 'back',
                  onPressed: () => context.go(Routes.tasks),
                ),
                ShellMiniNavItemSpec(
                  id: 'estimates',
                  icon: Icons.calculate_outlined,
                  label: context.l10n.taskEstimatesTitle,
                  selected: _activeTab == _tabEstimates,
                  callbackToken: 'estimates-$_activeTab',
                  onPressed: () => setState(() => _activeTab = _tabEstimates),
                ),
                ShellMiniNavItemSpec(
                  id: 'labels',
                  icon: Icons.label_outline,
                  label: context.l10n.taskLabelsTab,
                  selected: _activeTab == _tabLabels,
                  callbackToken: 'labels-$_activeTab',
                  onPressed: () => setState(() => _activeTab = _tabLabels),
                ),
              ],
            ),
            if (_canManageProjects)
              SpeedDialFab(
                label: context.l10n.taskPlanningTitle,
                icon: Icons.add,
                includeBottomSafeArea: false,
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
              child: RefreshIndicator(
                onRefresh: () => _reload(context),
                child: ListView(
                  padding: EdgeInsets.fromLTRB(16, 12, 16, listBottomPadding),
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
                        isSaving: labelsState.status == TaskLabelsStatus.saving,
                        onEdit: _openEditLabel,
                        onDelete: _deleteLabel,
                      ),
                  ],
                ),
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
    final capturedUserId = currentUserId;

    if (!mounted) {
      return;
    }
    setState(() => _isCheckingPermissions = true);

    if (wsId == null || currentUserId == null) {
      if (!_canUpdatePermissionsState(capturedWsId, capturedUserId)) {
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

      if (!_canUpdatePermissionsState(capturedWsId, capturedUserId)) {
        return;
      }
      setState(() {
        _canManageProjects = permissions.containsPermission('manage_projects');
        _isCheckingPermissions = false;
        _hasResolvedPermissions = true;
      });
    } on Exception {
      if (!_canUpdatePermissionsState(capturedWsId, capturedUserId)) {
        return;
      }
      setState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
        _hasResolvedPermissions = true;
      });
    }
  }

  bool _canUpdatePermissionsState(
    String? capturedWsId,
    String? capturedUserId,
  ) {
    if (!mounted) {
      return false;
    }

    final currentWsId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    final latestUserId = context.read<AuthCubit>().state.user?.id;
    return currentWsId == capturedWsId && latestUserId == capturedUserId;
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

    final l10n = context.l10n;
    final rootNavigator = Navigator.of(context, rootNavigator: true);
    final created = await showAdaptiveSheet<bool>(
      context: context,
      useRootNavigator: true,
      builder: (_) => TaskLabelDialog(
        title: l10n.taskLabelsCreate,
        submitLabel: l10n.taskLabelsCreate,
        onSubmit: (value) async {
          try {
            await context.read<TaskLabelsCubit>().createLabel(
              wsId: wsId,
              name: value.name,
              color: value.color,
            );
            return true;
          } on ApiException catch (error) {
            if (!mounted || !rootNavigator.mounted) {
              return false;
            }
            final message = error.message.isNotEmpty
                ? error.message
                : l10n.commonSomethingWentWrong;
            shad.showToast(
              context: rootNavigator.context,
              builder: (_, overlay) => shad.Alert.destructive(
                title: Text(l10n.commonSomethingWentWrong),
                content: Text(message),
              ),
            );
            return false;
          } on Exception {
            if (!mounted || !rootNavigator.mounted) {
              return false;
            }
            shad.showToast(
              context: rootNavigator.context,
              builder: (_, overlay) => shad.Alert.destructive(
                content: Text(l10n.commonSomethingWentWrong),
              ),
            );
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
          shad.Alert(content: Text(l10n.taskLabelsCreated)),
    );
    setState(() => _activeTab = _tabLabels);
  }

  Future<void> _openEditLabel(TaskLabel label) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }

    final l10n = context.l10n;
    final rootNavigator = Navigator.of(context, rootNavigator: true);
    final updated = await showAdaptiveSheet<bool>(
      context: context,
      useRootNavigator: true,
      builder: (_) => TaskLabelDialog(
        title: l10n.taskLabelsEdit,
        submitLabel: l10n.timerSave,
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
            if (!mounted || !rootNavigator.mounted) {
              return false;
            }
            final message = error.message.isNotEmpty
                ? error.message
                : l10n.commonSomethingWentWrong;
            shad.showToast(
              context: rootNavigator.context,
              builder: (_, overlay) => shad.Alert.destructive(
                title: Text(l10n.commonSomethingWentWrong),
                content: Text(message),
              ),
            );
            return false;
          } on Exception {
            if (!mounted || !rootNavigator.mounted) {
              return false;
            }
            shad.showToast(
              context: rootNavigator.context,
              builder: (_, overlay) => shad.Alert.destructive(
                content: Text(l10n.commonSomethingWentWrong),
              ),
            );
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
          shad.Alert(content: Text(l10n.taskLabelsUpdated)),
    );
  }

  Future<void> _deleteLabel(TaskLabel label) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }

    final rootNavigator = Navigator.of(context, rootNavigator: true);
    final deleted =
        await showAdaptiveSheet<bool>(
          context: context,
          useRootNavigator: true,
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
