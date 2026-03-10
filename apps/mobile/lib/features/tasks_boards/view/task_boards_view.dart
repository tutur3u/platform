import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/task_board_summary.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/tasks_boards/cubit/task_boards_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_form_dialog.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/fab/fab_action.dart';
import 'package:mobile/widgets/fab/speed_dial_fab.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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

  late final WorkspacePermissionsRepository _permissionsRepository;
  String? _permissionsWorkspaceId;
  bool _canManageProjects = false;
  bool _isCheckingPermissions = false;

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
    unawaited(_loadPermissions());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
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
          title: Text(l10n.taskBoardsTitle),
          trailing: [
            BlocBuilder<TaskBoardsCubit, TaskBoardsState>(
              buildWhen: (prev, curr) => prev.filter != curr.filter,
              builder: (context, state) {
                return Tooltip(
                  message: _filterLabel(context, state.filter),
                  child: shad.IconButton.ghost(
                    icon: const Icon(shad.LucideIcons.filter),
                    onPressed: () => _showFilterMenu(context, state.filter),
                  ),
                );
              },
            ),
          ],
        ),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final wsId = state.currentWorkspace?.id;
          if (wsId != null) {
            unawaited(context.read<TaskBoardsCubit>().loadBoards(wsId));
          }
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
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    if (_isCheckingPermissions) {
      return const Center(child: shad.CircularProgressIndicator());
    }
    if (!_canManageProjects) {
      return _AccessDeniedView(
        title: context.l10n.taskBoardsAccessDeniedTitle,
        description: context.l10n.taskBoardsAccessDeniedDescription,
      );
    }

    return BlocBuilder<TaskBoardsCubit, TaskBoardsState>(
      builder: (context, state) {
        if (state.status == TaskBoardsStatus.loading && state.boards.isEmpty) {
          return const Center(child: shad.CircularProgressIndicator());
        }

        if (state.status == TaskBoardsStatus.error && state.boards.isEmpty) {
          return _ErrorView(
            error: state.error,
            onRetry: _reload,
          );
        }

        final bottomPadding =
            _fabContentBottomPadding + MediaQuery.paddingOf(context).bottom;

        return ResponsiveWrapper(
          maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
          child: RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: EdgeInsets.fromLTRB(16, 12, 16, bottomPadding),
              children: [
                if (state.filteredBoards.isEmpty)
                  _EmptyView(filter: state.filter)
                else
                  ...state.filteredBoards.map(
                    (board) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _TaskBoardCard(
                        board: board,
                        onTap: () {},
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
              ],
            ),
          ),
        );
      },
    );
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
      });
      return;
    }

    try {
      final permissions = await _permissionsRepository.getPermissions(
        wsId: wsId,
      );
      if (!_canUpdatePermissionsState(capturedWsId)) return;
      setState(() {
        _canManageProjects = permissions.containsPermission('manage_projects');
        _isCheckingPermissions = false;
      });
    } on Exception {
      if (!_canUpdatePermissionsState(capturedWsId)) return;
      setState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
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
      _showSuccessToast(context.l10n.taskBoardsDeleted);
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
      _showSuccessToast(context.l10n.taskBoardsDeletedForever);
    }
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

  String _filterLabel(BuildContext context, TaskBoardsFilter filter) {
    final l10n = context.l10n;
    return switch (filter) {
      TaskBoardsFilter.active => l10n.taskBoardsFilterActive,
      TaskBoardsFilter.archived => l10n.taskBoardsFilterArchived,
      TaskBoardsFilter.recentlyDeleted => l10n.taskBoardsFilterRecentlyDeleted,
    };
  }

  void _showFilterMenu(BuildContext context, TaskBoardsFilter selected) {
    shad.showDropdown<void>(
      context: context,
      builder: (context) {
        return shad.DropdownMenu(
          children: [
            _buildFilterMenuButton(
              context: context,
              selected: selected,
              filter: TaskBoardsFilter.active,
            ),
            _buildFilterMenuButton(
              context: context,
              selected: selected,
              filter: TaskBoardsFilter.archived,
            ),
            _buildFilterMenuButton(
              context: context,
              selected: selected,
              filter: TaskBoardsFilter.recentlyDeleted,
            ),
          ],
        );
      },
    );
  }

  shad.MenuButton _buildFilterMenuButton({
    required BuildContext context,
    required TaskBoardsFilter selected,
    required TaskBoardsFilter filter,
  }) {
    return shad.MenuButton(
      leading: selected == filter
          ? const Icon(Icons.check, size: 16)
          : const SizedBox(width: 16, height: 16),
      onPressed: (context) {
        context.read<TaskBoardsCubit>().setFilter(filter);
      },
      child: Text(_filterLabel(context, filter)),
    );
  }
}

class _TaskBoardCard extends StatelessWidget {
  const _TaskBoardCard({
    required this.board,
    required this.onTap,
    required this.onEdit,
    required this.onDuplicate,
    required this.onArchive,
    required this.onUnarchive,
    required this.onDelete,
    required this.onRestore,
    required this.onDeleteForever,
  });

  final TaskBoardSummary board;
  final VoidCallback onTap;
  final VoidCallback onEdit;
  final VoidCallback onDuplicate;
  final VoidCallback onArchive;
  final VoidCallback onUnarchive;
  final VoidCallback onDelete;
  final VoidCallback onRestore;
  final VoidCallback onDeleteForever;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final createdLabel = board.createdAt == null
        ? '-'
        : DateFormat.yMMMd().format(board.createdAt!);
    final boardCounts =
        '${board.listCount} ${context.l10n.taskBoardsListsCount} • '
        '${board.taskCount} ${context.l10n.taskBoardsTasksCount}';

    return shad.Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(resolvePlatformIcon(board.icon), size: 20),
                  const shad.Gap(8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          board.name ?? context.l10n.taskEstimatesUnnamedBoard,
                          style: theme.typography.large.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const shad.Gap(4),
                        Text(
                          boardCounts,
                          style: theme.typography.textSmall.copyWith(
                            color: theme.colorScheme.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  shad.IconButton.ghost(
                    icon: const Icon(Icons.more_horiz),
                    onPressed: () => _showActionMenu(context),
                  ),
                ],
              ),
              const shad.Gap(10),
              Text(
                '${context.l10n.taskBoardsCreatedAt}: $createdLabel',
                style: theme.typography.textSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
              if (board.isArchived) ...[
                const shad.Gap(8),
                shad.OutlineBadge(child: Text(context.l10n.taskBoardsArchived)),
              ],
              if (board.isRecentlyDeleted) ...[
                const shad.Gap(8),
                shad.OutlineBadge(
                  child: Text(context.l10n.taskBoardsRecentlyDeleted),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _showActionMenu(BuildContext context) {
    shad.showDropdown<void>(
      context: context,
      builder: (context) => shad.DropdownMenu(children: _menuButtons(context)),
    );
  }

  List<shad.MenuItem> _menuButtons(BuildContext context) {
    if (board.isRecentlyDeleted) {
      return [
        shad.MenuButton(
          onPressed: (context) => onRestore(),
          child: Text(context.l10n.taskBoardsRestore),
        ),
        shad.MenuButton(
          onPressed: (context) => onDeleteForever(),
          child: Text(context.l10n.taskBoardsDeleteForever),
        ),
      ];
    }

    if (board.isArchived) {
      return [
        shad.MenuButton(
          onPressed: (context) => onUnarchive(),
          child: Text(context.l10n.taskBoardsUnarchive),
        ),
        shad.MenuButton(
          onPressed: (context) => onDelete(),
          child: Text(context.l10n.taskBoardsDelete),
        ),
      ];
    }

    return [
      shad.MenuButton(
        onPressed: (context) => onEdit(),
        child: Text(context.l10n.taskBoardsEdit),
      ),
      shad.MenuButton(
        onPressed: (context) => onDuplicate(),
        child: Text(context.l10n.taskBoardsDuplicate),
      ),
      shad.MenuButton(
        onPressed: (context) => onArchive(),
        child: Text(context.l10n.taskBoardsArchive),
      ),
      shad.MenuButton(
        onPressed: (context) => onDelete(),
        child: Text(context.l10n.taskBoardsDelete),
      ),
    ];
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.filter});

  final TaskBoardsFilter filter;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final title = switch (filter) {
      TaskBoardsFilter.active => l10n.taskBoardsEmptyTitle,
      TaskBoardsFilter.archived => l10n.taskBoardsEmptyArchivedTitle,
      TaskBoardsFilter.recentlyDeleted => l10n.taskBoardsEmptyDeletedTitle,
    };
    final description = switch (filter) {
      TaskBoardsFilter.active => l10n.taskBoardsEmptyDescription,
      TaskBoardsFilter.archived => l10n.taskBoardsEmptyArchivedDescription,
      TaskBoardsFilter.recentlyDeleted =>
        l10n.taskBoardsEmptyDeletedDescription,
    };

    return shad.Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Icon(
              Icons.view_kanban_outlined,
              size: 40,
              color: shad.Theme.of(context).colorScheme.mutedForeground,
            ),
            const shad.Gap(10),
            Text(title, textAlign: TextAlign.center),
            const shad.Gap(4),
            Text(
              description,
              textAlign: TextAlign.center,
              style: shad.Theme.of(context).typography.textMuted,
            ),
          ],
        ),
      ),
    );
  }
}

class _AccessDeniedView extends StatelessWidget {
  const _AccessDeniedView({
    required this.title,
    required this.description,
  });

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lock_outline, size: 48),
            const shad.Gap(12),
            Text(title, textAlign: TextAlign.center),
            const shad.Gap(6),
            Text(description, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry, this.error});

  final String? error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 48),
          const shad.Gap(12),
          Text(
            error ?? context.l10n.taskBoardsLoadError,
            textAlign: TextAlign.center,
          ),
          const shad.Gap(12),
          shad.OutlineButton(
            onPressed: () => unawaited(onRetry()),
            child: Text(context.l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}
