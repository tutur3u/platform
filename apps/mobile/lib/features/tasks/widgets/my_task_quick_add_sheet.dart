import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/tasks/widgets/task_board_picker_sheet.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';
import 'package:mobile/features/tasks_boards/widgets/task_priority_visuals.dart';
import 'package:mobile/l10n/l10n.dart';

class MyTaskQuickAddSheet extends StatefulWidget {
  const MyTaskQuickAddSheet({
    required this.repository,
    required this.cubit,
    required this.workspaceId,
    required this.isCurrentScope,
    required this.now,
    this.zone,
    super.key,
  });

  final TaskRepository repository;
  final TaskListCubit cubit;
  final String workspaceId;
  final bool Function() isCurrentScope;
  final DateTime now;
  final String? zone;

  @override
  State<MyTaskQuickAddSheet> createState() => _MyTaskQuickAddSheetState();
}

class _MyTaskQuickAddSheetState extends State<MyTaskQuickAddSheet> {
  final _title = TextEditingController();
  TaskBoardInfo? _board;
  TaskBoardList? _list;
  List<TaskBoardList> _lists = const [];
  DateTime? _due;
  String? _priority;
  bool _loadingLists = false;
  bool _failedLists = false;
  bool _saving = false;
  bool _saveFailed = false;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _chooseBoard() async {
    final board = await pickTaskBoard(
      context,
      repository: widget.repository,
      workspaceId: widget.workspaceId,
      selectedId: _board?.id,
    );
    if (board == null || !mounted || !widget.isCurrentScope()) return;
    if (board.id == _board?.id && !_failedLists) return;
    await _loadLists(
      TaskBoardInfo(id: board.id, name: board.name, wsId: widget.workspaceId),
    );
  }

  Future<void> _loadLists(TaskBoardInfo board) async {
    setState(() {
      _board = board;
      _list = null;
      _lists = const [];
      _loadingLists = true;
      _failedLists = false;
    });
    try {
      final lists = await widget.repository.getBoardLists(
        widget.workspaceId,
        board.id,
      );
      if (!mounted || _board?.id != board.id || !widget.isCurrentScope()) {
        return;
      }
      setState(() {
        _lists = lists
            .where(
              (list) =>
                  !list.archived &&
                  (list.status == 'active' || list.status == 'not_started'),
            )
            .toList();
        _list = _lists.length == 1 ? _lists.single : null;
        _loadingLists = false;
      });
    } on Exception {
      if (!mounted || _board?.id != board.id) return;
      setState(() {
        _loadingLists = false;
        _failedLists = true;
      });
    }
  }

  Future<void> _pickDue() async {
    final day = await showAppDatePicker(
      context: context,
      initialDate: _due ?? taskDay(widget.now, widget.zone),
      firstDate: DateTime(1900),
      lastDate: DateTime(2200),
    );
    if (day != null && mounted) setState(() => _due = day);
  }

  Future<void> _save() async {
    final name = _title.text.trim();
    final board = _board;
    final list = _list;
    if (_saving ||
        name.isEmpty ||
        board == null ||
        list == null ||
        !widget.isCurrentScope()) {
      return;
    }
    setState(() {
      _saving = true;
      _saveFailed = false;
    });
    try {
      final due = _due;
      await widget.cubit.createMyTask(
        name: name,
        board: board,
        list: list,
        priority: _priority,
        due: due == null ? null : taskEndOfDayIn(due, widget.zone),
        zone: widget.zone,
      );
      if (mounted && widget.isCurrentScope()) Navigator.of(context).pop(true);
    } on Exception {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _saveFailed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final due = _due;
    final priority = _priority;
    return AppSheetScaffold(
      title: l10n.taskBoardDetailCreateTask,
      actions: [
        AppButton.primary(
          key: const ValueKey('my-task-save'),
          onPressed: _saving || _title.text.trim().isEmpty || _list == null
              ? null
              : _save,
          loading: _saving,
          child: Text(l10n.taskBoardDetailCreateTask),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.md,
        children: [
          AppTextField(
            key: const ValueKey('my-task-title'),
            controller: _title,
            label: l10n.taskBoardDetailTaskTitleLabel,
            placeholder: l10n.taskBoardDetailUntitledTask,
            autofocus: true,
            enabled: !_saving,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => unawaited(_save()),
          ),
          AppButton.outline(
            key: const ValueKey('my-task-board'),
            onPressed: _saving || _loadingLists ? null : _chooseBoard,
            leading: const Icon(LucideIcons.columns3),
            child: Text(_board?.name ?? l10n.tasksChooseBoard),
          ),
          if (_loadingLists) const AppSkeletonRows(count: 1),
          if (_failedLists)
            AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: l10n.commonSomethingWentWrong,
              actionLabel: l10n.commonRetry,
              onAction: () => _loadLists(_board!),
            ),
          if (_board != null && !_loadingLists && !_failedLists)
            if (_lists.isEmpty)
              AppStateMessage.inline(
                icon: LucideIcons.list,
                title: l10n.tasksNoListsToChoose,
              )
            else
              AppSelect<TaskBoardList>(
                title: l10n.taskBoardDetailTaskListLabel,
                placeholder: l10n.taskBoardDetailTaskListSelect,
                value: _list,
                onChanged: _saving
                    ? null
                    : (list) => setState(() => _list = list),
                options: [
                  for (final list in _lists)
                    AppSelectOption(
                      value: list,
                      label: list.name ?? l10n.taskBoardDetailUntitledList,
                    ),
                ],
              ),
          AppSelect<String>(
            title: l10n.taskBoardDetailPriority,
            placeholder: l10n.taskBoardDetailPriority,
            value: priority,
            onChanged: _saving
                ? null
                : (value) =>
                      setState(() => _priority = value.isEmpty ? null : value),
            options: [
              AppSelectOption(
                value: '',
                label: TaskPriorityLevel.noneLabel(l10n),
              ),
              for (final level in TaskPriorityLevel.values)
                AppSelectOption(
                  value: level.value,
                  label: level.label(l10n),
                  icon: level.icon,
                ),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: AppButton.outline(
                  key: const ValueKey('my-task-due'),
                  onPressed: _saving ? null : _pickDue,
                  leading: const Icon(LucideIcons.calendar),
                  child: Text(
                    due == null
                        ? l10n.taskBoardDetailSetDueDate
                        : DateFormat.yMMMd(l10n.localeName).format(due),
                  ),
                ),
              ),
              if (due != null)
                AppIconButton(
                  icon: const Icon(LucideIcons.x),
                  tooltip: l10n.taskBoardDetailRemoveDueDate,
                  onPressed: _saving ? null : () => setState(() => _due = null),
                ),
            ],
          ),
          if (_saveFailed)
            AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: l10n.commonSomethingWentWrong,
            ),
        ],
      ),
    );
  }
}
