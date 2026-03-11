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
import 'package:shared_preferences/shared_preferences.dart';

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
  static const String _pageSizePreferenceKey = 'task_boards_page_size';
  static const List<int> _pageSizeOptions = [1, 5, 10, 20, 50, 100, 200];

  late final WorkspacePermissionsRepository _permissionsRepository;
  String? _permissionsWorkspaceId;
  bool _canManageProjects = false;
  bool _isCheckingPermissions = false;
  bool _permissionsLoadFailed = false;
  int _pageSize = 20;

  @override
  void initState() {
    super.initState();
    _permissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
    unawaited(_loadPageSizePreference());
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
            Tooltip(
              message: '${l10n.taskBoardsPageSize}: $_pageSize',
              child: shad.IconButton.ghost(
                icon: const Icon(shad.LucideIcons.listOrdered),
                onPressed: () => _showPageSizeMenu(context),
              ),
            ),
          ],
        ),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
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
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    if (_isCheckingPermissions) {
      return const Center(child: shad.CircularProgressIndicator());
    }
    if (_permissionsLoadFailed) {
      return _ErrorView(
        error: context.l10n.commonSomethingWentWrong,
        onRetry: _loadPermissions,
      );
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
              physics: const AlwaysScrollableScrollPhysics(),
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
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: _PaginationRow(
                    currentPage: state.currentPage,
                    totalPages: state.totalPages,
                    onPrevious: state.hasPreviousPage
                        ? () => unawaited(_goToPage(state.currentPage - 1))
                        : null,
                    onNext: state.hasNextPage
                        ? () => unawaited(_goToPage(state.currentPage + 1))
                        : null,
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
        _permissionsLoadFailed = false;
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
      });

      if (canManageProjects && mounted) {
        unawaited(
          context.read<TaskBoardsCubit>().loadBoards(
            wsId,
            pageSize: _pageSize,
          ),
        );
      }
    } on Exception {
      if (!_canUpdatePermissionsState(capturedWsId)) return;
      setState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
        _permissionsLoadFailed = true;
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
    await context.read<TaskBoardsCubit>().loadBoards(wsId, pageSize: _pageSize);
  }

  Future<void> _loadPageSizePreference() async {
    final prefs = await SharedPreferences.getInstance();
    final storedPageSize = prefs.getInt(_pageSizePreferenceKey) ?? 20;
    final normalizedPageSize = storedPageSize.clamp(1, 200);

    if (!mounted) return;
    if (_pageSize == normalizedPageSize) return;

    setState(() => _pageSize = normalizedPageSize);

    if (!_canManageProjects || _permissionsLoadFailed) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    unawaited(
      context.read<TaskBoardsCubit>().loadBoards(wsId, pageSize: _pageSize),
    );
  }

  Future<void> _setPageSize(int newPageSize) async {
    final normalizedPageSize = newPageSize.clamp(1, 200);
    if (_pageSize == normalizedPageSize) return;

    final taskBoardsCubit = context.read<TaskBoardsCubit>();
    final capturedWsId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;

    setState(() => _pageSize = normalizedPageSize);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_pageSizePreferenceKey, normalizedPageSize);
    if (!mounted) return;

    if (!_canManageProjects || _permissionsLoadFailed) return;
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null || capturedWsId == null || wsId != capturedWsId) return;
    await taskBoardsCubit.goToPage(
      wsId,
      1,
      pageSize: normalizedPageSize,
    );
  }

  Future<void> _goToPage(int page) async {
    if (!_canManageProjects || _permissionsLoadFailed) return;
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await context.read<TaskBoardsCubit>().goToPage(wsId, page);
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
    shad.showDropdown<void>(
      context: context,
      builder: (context) {
        return shad.DropdownMenu(
          children: [
            _buildFilterMenuButton(
              context: context,
              selected: selected,
              filter: TaskBoardsFilter.all,
            ),
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

  void _showPageSizeMenu(BuildContext context) {
    shad.showDropdown<void>(
      context: context,
      builder: (context) => shad.DropdownMenu(
        children: _pageSizeOptions
            .map(
              (option) => shad.MenuButton(
                leading: _pageSize == option
                    ? const Icon(Icons.check, size: 16)
                    : const SizedBox(width: 16, height: 16),
                onPressed: (context) {
                  unawaited(_setPageSize(option));
                },
                child: Text(
                  context.l10n.taskBoardsPageSizeOption(option),
                ),
              ),
            )
            .toList(growable: false),
      ),
    );
  }

  shad.MenuButton _buildFilterMenuButton({
    required BuildContext context,
    required TaskBoardsFilter selected,
    required TaskBoardsFilter filter,
  }) {
    final cubit = this.context.read<TaskBoardsCubit>();
    return shad.MenuButton(
      leading: selected == filter
          ? const Icon(Icons.check, size: 16)
          : const SizedBox(width: 16, height: 16),
      onPressed: (_) {
        cubit.setFilter(filter);
      },
      child: Text(_filterLabel(context, filter)),
    );
  }
}

class _PaginationRow extends StatelessWidget {
  const _PaginationRow({
    required this.currentPage,
    required this.totalPages,
    required this.onPrevious,
    required this.onNext,
  });

  final int currentPage;
  final int totalPages;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Row(
      children: [
        shad.OutlineButton(
          onPressed: onPrevious,
          child: Text(l10n.commonPrevious),
        ),
        const shad.Gap(8),
        Expanded(
          child: Center(
            child: Text(l10n.taskBoardsPageInfo(currentPage, totalPages)),
          ),
        ),
        const shad.Gap(8),
        shad.OutlineButton(
          onPressed: onNext,
          child: Text(l10n.commonNext),
        ),
      ],
    );
  }
}
