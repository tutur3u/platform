import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/task_board_summary.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/tasks_boards/cubit/task_boards_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_form_dialog.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/fab/fab_action.dart';
import 'package:mobile/widgets/fab/speed_dial_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'task_boards_cards.dart';
part 'task_boards_states.dart';

class TaskBoardsView extends StatefulWidget {
  const TaskBoardsView({
    super.key,
    this.permissionsRepository,
  });

  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<TaskBoardsView> createState() => _TaskBoardsViewState();
}

class _TaskBoardsViewState extends State<TaskBoardsView> {
  static const double _fabContentBottomPadding = 96;
  static final Map<String, bool> _permissionCache = {};

  late final WorkspacePermissionsRepository _permissionsRepository;
  final ScrollController _scrollController = ScrollController();
  String? _permissionsWorkspaceId;
  bool _canManageProjects = false;
  bool _isCheckingPermissions = false;
  bool _permissionsLoadFailed = false;
  bool _hasResolvedPermissions = false;

  @override
  void initState() {
    super.initState();
    _permissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
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
    final l10n = context.l10n;
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (prev, curr) =>
          prev.currentWorkspace?.id != curr.currentWorkspace?.id,
      listener: (context, state) {
        unawaited(_loadPermissions());
      },
      child: Stack(
        children: [
          _buildContent(context),
          if (_canManageProjects)
            SpeedDialFab(
              label: l10n.taskBoardsTitle,
              icon: Icons.add,
              actions: [
                FabAction(
                  icon: Icons.add_box_outlined,
                  label: l10n.taskBoardsCreate,
                  onPressed: _openCreateBoard,
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    final taskBoardsState = context.watch<TaskBoardsCubit>().state;
    final hasVisibleBoards = taskBoardsState.boards.isNotEmpty;
    final shellActions = [
      ShellActionSpec(
        id: 'task-boards-filter',
        icon: shad.LucideIcons.slidersHorizontal,
        tooltip: _filterLabel(context, taskBoardsState.filter),
        highlighted: taskBoardsState.filter != TaskBoardsFilter.active,
        onPressed: () => _showFilterMenu(context, taskBoardsState.filter),
      ),
    ];
    final shellActionRegistration = ShellChromeActions(
      ownerId: 'task-boards-root',
      locations: const {Routes.taskBoards},
      actions: shellActions,
    );

    if (_isCheckingPermissions &&
        !_hasResolvedPermissions &&
        !hasVisibleBoards) {
      return Stack(
        children: [
          shellActionRegistration,
          const Center(child: NovaLoadingIndicator()),
        ],
      );
    }
    if (_permissionsLoadFailed && !hasVisibleBoards) {
      return Stack(
        children: [
          shellActionRegistration,
          _ErrorView(
            error: context.l10n.commonSomethingWentWrong,
            onRetry: _loadPermissions,
          ),
        ],
      );
    }
    if (_hasResolvedPermissions && !_canManageProjects && !hasVisibleBoards) {
      return Stack(
        children: [
          shellActionRegistration,
          _AccessDeniedView(
            title: context.l10n.taskBoardsAccessDeniedTitle,
            description: context.l10n.taskBoardsAccessDeniedDescription,
          ),
        ],
      );
    }

    return BlocBuilder<TaskBoardsCubit, TaskBoardsState>(
      builder: (context, state) {
        if (state.status == TaskBoardsStatus.loading && state.boards.isEmpty) {
          return Stack(
            children: [
              shellActionRegistration,
              const Center(child: NovaLoadingIndicator()),
            ],
          );
        }

        if (state.status == TaskBoardsStatus.error && state.boards.isEmpty) {
          return Stack(
            children: [
              shellActionRegistration,
              _ErrorView(
                error: state.error,
                onRetry: _reload,
              ),
            ],
          );
        }

        final bottomPadding =
            _fabContentBottomPadding + MediaQuery.paddingOf(context).bottom;

        return ResponsiveWrapper(
          maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
          child: RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              controller: _scrollController,
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.fromLTRB(16, 12, 16, bottomPadding),
              children: [
                shellActionRegistration,
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _BoardsMetaRow(
                    filterLabel: _filterLabel(context, state.filter),
                    boardCount: state.filteredBoards.length,
                  ),
                ),
                if (state.filteredBoards.isEmpty)
                  _EmptyView(filter: state.filter)
                else
                  ...state.filteredBoards.map(
                    (board) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _TaskBoardCard(
                        canManage: _canManageProjects,
                        board: board,
                        onTap: () => context.push(
                          Routes.taskBoardDetailPath(board.id),
                        ),
                        onEdit: () => _openEditBoard(board),
                        onDuplicate: () => _duplicateBoard(board),
                        onArchive: () => _archiveBoard(board),
                        onUnarchive: () => _unarchiveBoard(board),
                        onDelete: () => _deleteBoard(board),
                        onRestore: () => _restoreBoard(board),
                        onDeleteForever: () => _deleteBoardForever(board),
                      ),
                    ),
                  ),
                if (state.isLoadingMore)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Center(child: NovaLoadingIndicator()),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;

    final state = context.read<TaskBoardsCubit>().state;
    if (!state.hasNextPage || state.isLoadingMore) {
      return;
    }

    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 280) {
      final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
      if (wsId != null) {
        unawaited(context.read<TaskBoardsCubit>().loadMoreBoards(wsId));
      }
    }
  }

  Future<void> _loadPermissions() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final capturedWsId = wsId;

    if (!mounted) return;
    setState(() => _isCheckingPermissions = true);

    if (wsId == null) {
      if (!_canUpdatePermissionsState(capturedWsId)) return;
      setState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
        _permissionsLoadFailed = false;
        _hasResolvedPermissions = true;
      });
      return;
    }

    try {
      final permissions = await _permissionsRepository.getPermissions(
        wsId: wsId,
      );
      if (!_canUpdatePermissionsState(capturedWsId)) return;
      final canManageProjects = permissions.containsPermission(
        'manage_projects',
      );
      setState(() {
        _canManageProjects = canManageProjects;
        _isCheckingPermissions = false;
        _permissionsLoadFailed = false;
        _hasResolvedPermissions = true;
      });
      _permissionCache[wsId] = canManageProjects;

      if (canManageProjects && mounted) {
        unawaited(
          context.read<TaskBoardsCubit>().loadBoards(
            wsId,
          ),
        );
      }
    } on Exception {
      if (!_canUpdatePermissionsState(capturedWsId)) return;
      setState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
        _permissionsLoadFailed = true;
        _hasResolvedPermissions = true;
      });
    }
  }

  bool _canUpdatePermissionsState(String? capturedWsId) {
    if (!mounted) return false;
    final currentWsId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    return currentWsId == capturedWsId;
  }

  Future<void> _reload() async {
    if (_permissionsLoadFailed) {
      await _loadPermissions();
      return;
    }
    if (!_canManageProjects) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await context.read<TaskBoardsCubit>().loadBoards(wsId);
  }

  Future<void> _openCreateBoard() async {
    final result = await shad.showDialog<TaskBoardFormValue>(
      context: context,
      builder: (_) => TaskBoardFormDialog(
        title: context.l10n.taskBoardsCreate,
        confirmLabel: context.l10n.taskBoardsCreate,
      ),
    );
    if (result == null || !mounted) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    await _runAction(
      () => context.read<TaskBoardsCubit>().createBoard(
        wsId: wsId,
        name: result.name,
        icon: result.icon,
      ),
      successMessage: context.l10n.taskBoardsCreated,
    );
  }

  Future<void> _openEditBoard(TaskBoardSummary board) async {
    final result = await shad.showDialog<TaskBoardFormValue>(
      context: context,
      builder: (_) => TaskBoardFormDialog(
        initialName: board.name,
        initialIcon: board.icon,
        title: context.l10n.taskBoardsEdit,
        confirmLabel: context.l10n.timerSave,
      ),
    );
    if (result == null || !mounted) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    await _runAction(
      () => context.read<TaskBoardsCubit>().updateBoard(
        wsId: wsId,
        boardId: board.id,
        name: result.name,
        icon: result.icon,
      ),
      successMessage: context.l10n.taskBoardsUpdated,
    );
  }

  Future<void> _duplicateBoard(TaskBoardSummary board) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await _runAction(
      () => context.read<TaskBoardsCubit>().duplicateBoard(
        wsId: wsId,
        boardId: board.id,
      ),
      successMessage: context.l10n.taskBoardsDuplicated,
    );
  }

  Future<void> _archiveBoard(TaskBoardSummary board) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await _runAction(
      () => context.read<TaskBoardsCubit>().archiveBoard(
        wsId: wsId,
        boardId: board.id,
      ),
      successMessage: context.l10n.taskBoardsArchived,
    );
  }

  Future<void> _unarchiveBoard(TaskBoardSummary board) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await _runAction(
      () => context.read<TaskBoardsCubit>().unarchiveBoard(
        wsId: wsId,
        boardId: board.id,
      ),
      successMessage: context.l10n.taskBoardsUnarchived,
    );
  }

  Future<void> _deleteBoard(TaskBoardSummary board) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final successMessage = context.l10n.taskBoardsDeleted;

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.taskBoardsDelete,
            message: context.l10n.taskBoardsDeleteConfirm,
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.taskBoardsDelete,
            toastContext: toastContext,
            onConfirm: () async {
              await context.read<TaskBoardsCubit>().softDeleteBoard(
                wsId: wsId,
                boardId: board.id,
              );
            },
          ),
        ) ??
        false;

    if (deleted && mounted) {
      if (!toastContext.mounted) return;
      _showSuccessToast(toastContext, successMessage);
    }
  }

  Future<void> _restoreBoard(TaskBoardSummary board) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await _runAction(
      () => context.read<TaskBoardsCubit>().restoreBoard(
        wsId: wsId,
        boardId: board.id,
      ),
      successMessage: context.l10n.taskBoardsRestored,
    );
  }

  Future<void> _deleteBoardForever(TaskBoardSummary board) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final successMessage = context.l10n.taskBoardsDeletedForever;

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.taskBoardsDeleteForever,
            message: context.l10n.taskBoardsDeleteForeverConfirm,
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.taskBoardsDeleteForever,
            toastContext: toastContext,
            onConfirm: () async {
              await context.read<TaskBoardsCubit>().permanentlyDeleteBoard(
                wsId: wsId,
                boardId: board.id,
              );
            },
          ),
        ) ??
        false;

    if (deleted && mounted) {
      if (!toastContext.mounted) return;
      _showSuccessToast(toastContext, successMessage);
    }
  }

  Future<void> _runAction(
    Future<void> Function() action, {
    required String successMessage,
  }) async {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;
    try {
      await action();
      if (mounted) {
        if (!toastContext.mounted) return;
        _showSuccessToast(toastContext, successMessage);
      }
    } on ApiException catch (error) {
      if (mounted) {
        if (!toastContext.mounted) return;
        _showErrorToast(
          toastContext,
          error.message.trim().isEmpty ? fallbackErrorMessage : error.message,
        );
      }
    } on Exception {
      if (mounted) {
        if (!toastContext.mounted) return;
        _showErrorToast(toastContext, fallbackErrorMessage);
      }
    }
  }

  void _showSuccessToast(BuildContext toastContext, String message) {
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert(content: Text(message)),
    );
  }

  void _showErrorToast(BuildContext toastContext, String message) {
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) =>
          shad.Alert.destructive(content: Text(message)),
    );
  }

  String _filterLabel(BuildContext context, TaskBoardsFilter filter) {
    final l10n = context.l10n;
    return switch (filter) {
      TaskBoardsFilter.all => l10n.taskBoardsFilterAll,
      TaskBoardsFilter.active => l10n.taskBoardsFilterActive,
      TaskBoardsFilter.archived => l10n.taskBoardsFilterArchived,
      TaskBoardsFilter.recentlyDeleted => l10n.taskBoardsFilterRecentlyDeleted,
    };
  }

  void _showFilterMenu(BuildContext context, TaskBoardsFilter selected) {
    final cubit = context.read<TaskBoardsCubit>();
    final isCompact = context.isCompact;
    unawaited(
      showAdaptiveDrawer(
        context: context,
        builder: (drawerContext) {
          return SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: TaskBoardsFilter.values.map((filter) {
                return InkWell(
                  onTap: () {
                    cubit.setFilter(filter);
                    if (isCompact) {
                      unawaited(shad.closeOverlay<void>(drawerContext));
                    } else {
                      unawaited(Navigator.maybePop(drawerContext));
                    }
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 14,
                    ),
                    child: Row(
                      children: [
                        if (selected == filter)
                          const Icon(Icons.check, size: 16)
                        else
                          const SizedBox(width: 16, height: 16),
                        const shad.Gap(12),
                        Text(
                          _filterLabel(drawerContext, filter),
                          style: shad.Theme.of(drawerContext).typography.base,
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          );
        },
      ),
    );
  }
}
