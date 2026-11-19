import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/task_board_summary.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/l10n/l10n.dart';

Future<TaskBoardSummary?> pickTaskBoard(
  BuildContext context, {
  required TaskRepository repository,
  required String workspaceId,
  String? selectedId,
}) => showAppSheet<TaskBoardSummary>(
  context: context,
  size: AppSheetSize.large,
  builder: (_) => _TaskBoardPicker(
    repository: repository,
    workspaceId: workspaceId,
    selectedId: selectedId,
  ),
);

class _TaskBoardPicker extends StatefulWidget {
  const _TaskBoardPicker({
    required this.repository,
    required this.workspaceId,
    this.selectedId,
  });

  final TaskRepository repository;
  final String workspaceId;
  final String? selectedId;

  @override
  State<_TaskBoardPicker> createState() => _TaskBoardPickerState();
}

class _TaskBoardPickerState extends State<_TaskBoardPicker> {
  final _boards = <TaskBoardSummary>[];
  bool _loading = true;
  bool _failed = false;
  bool _hasMore = true;
  int _page = 1;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final page = await widget.repository.getTaskBoards(
        widget.workspaceId,
        page: _page,
        pageSize: 50,
        status: 'active',
      );
      if (!mounted) return;
      setState(() {
        final knownIds = _boards.map((board) => board.id).toSet();
        _boards.addAll(page.boards.where((board) => knownIds.add(board.id)));
        _hasMore = page.page < page.totalPages;
        _page++;
        _loading = false;
      });
    } on Exception {
      if (!mounted) return;
      setState(() {
        _failed = true;
        _loading = false;
      });
    }
  }

  void _requestMore() {
    setState(() {
      _loading = true;
      _failed = false;
    });
    unawaited(_load());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.tasksChooseBoard,
      slivers: [
        SliverList.builder(
          itemCount: _boards.length,
          itemBuilder: (context, index) {
            final board = _boards[index];
            return ListTile(
              leading: const Icon(LucideIcons.columns3),
              title: Text(
                board.name?.trim().isNotEmpty == true
                    ? board.name!.trim()
                    : l10n.taskBoardDetailUntitledBoard,
              ),
              trailing: board.id == widget.selectedId
                  ? const Icon(LucideIcons.check)
                  : null,
              selected: board.id == widget.selectedId,
              onTap: () => Navigator.of(context).pop(board),
            );
          },
        ),
        SliverToBoxAdapter(
          child: switch ((_loading, _failed, _boards.isEmpty, _hasMore)) {
            (true, _, _, _) => const AppSkeletonRows(),
            (_, true, _, _) => AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: l10n.commonSomethingWentWrong,
              actionLabel: l10n.commonRetry,
              onAction: _requestMore,
            ),
            (_, _, true, _) => AppStateMessage.inline(
              icon: LucideIcons.columns3,
              title: l10n.tasksNoBoardsToChoose,
            ),
            (_, _, _, true) => AppButton.outline(
              onPressed: _requestMore,
              child: Text(l10n.timerHistoryLoadMore),
            ),
            _ => const SizedBox.shrink(),
          },
        ),
      ],
    );
  }
}
