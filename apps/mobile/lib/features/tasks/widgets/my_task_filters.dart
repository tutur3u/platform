import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/tasks_boards/widgets/task_priority_visuals.dart';
import 'package:mobile/l10n/l10n.dart';

enum MyTaskFilter { board, priority, label }

class MyTaskFilters extends StatelessWidget {
  const MyTaskFilters({
    required this.tasks,
    required this.selected,
    required this.onChanged,
    super.key,
  });

  final List<UserTask> tasks;
  final Map<MyTaskFilter, AppSheetChoice<String>> selected;
  final void Function(MyTaskFilter, AppSheetChoice<String>?) onChanged;

  List<AppSheetChoice<String>> _choices(
    BuildContext context,
    MyTaskFilter field,
  ) {
    final l10n = context.l10n;
    final names = switch (field) {
      MyTaskFilter.board => {
        for (final task in tasks)
          if (task.list?.board case final board?)
            board.id: board.name ?? l10n.taskBoardDetailUntitledBoard,
      },
      MyTaskFilter.priority => {
        for (final level in TaskPriorityLevel.values)
          level.value: level.label(l10n),
      },
      MyTaskFilter.label => {
        for (final task in tasks)
          for (final label in task.labels)
            if (label.name?.trim() case final name? when name.isNotEmpty)
              label.id: name,
      },
    };
    final entries = names.entries.toList();
    if (field != MyTaskFilter.priority) {
      entries.sort((a, b) => a.value.compareTo(b.value));
    }
    return [
      AppSheetChoice(value: '', label: l10n.commonAll),
      for (final item in entries)
        AppSheetChoice(value: item.key, label: item.value),
    ];
  }

  Future<void> _open(
    BuildContext context,
    MyTaskFilter field,
    String title,
  ) async {
    final choices = _choices(context, field);
    final current = selected[field]?.value ?? '';
    final value = await showAppChoiceSheet(
      context: context,
      title: title,
      choices: choices,
      selected: current,
    );
    if (value != null && context.mounted) {
      onChanged(
        field,
        value.isEmpty
            ? null
            : choices.firstWhere((choice) => choice.value == value),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fields = {
      MyTaskFilter.board: (l10n.tasksBoardFilter, LucideIcons.columns3),
      MyTaskFilter.priority: (l10n.taskBoardDetailPriority, LucideIcons.flag),
      MyTaskFilter.label: (l10n.taskBoardDetailTaskLabels, LucideIcons.tags),
    };
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      children: [
        for (final entry in fields.entries)
          AppChip(
            tooltip: entry.value.$1,
            label: Text(selected[entry.key]?.label ?? entry.value.$1),
            avatar: Icon(entry.value.$2, size: 15),
            selected: selected.containsKey(entry.key),
            onSelected: (_) => _open(context, entry.key, entry.value.$1),
          ),
      ],
    );
  }
}
