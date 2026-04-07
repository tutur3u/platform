part of 'task_board_detail_page.dart';

typedef TaskBoardListViewSortField = ({String field, bool ascending});

List<TaskBoardTask> sortTaskBoardListViewTasks(
  List<TaskBoardTask> tasks,
  TaskBoardListViewSortField sort,
) {
  final sorted = List<TaskBoardTask>.from(tasks)
    ..sort((a, b) {
      final aCompleted = a.closedAt != null;
      final bCompleted = b.closedAt != null;

      if (aCompleted != bCompleted) {
        return aCompleted ? 1 : -1;
      }

      final comparison = switch (sort.field) {
        'name' => (a.name ?? '').compareTo(b.name ?? ''),
        'priority' => _taskBoardListViewPriorityValue(
          a.priority,
        ).compareTo(_taskBoardListViewPriorityValue(b.priority)),
        'start_date' => _taskBoardListViewDateValue(
          a.startDate,
        ).compareTo(_taskBoardListViewDateValue(b.startDate)),
        'end_date' => _taskBoardListViewDateValue(
          a.endDate,
        ).compareTo(_taskBoardListViewDateValue(b.endDate)),
        'created_at' => _taskBoardListViewDateValue(
          a.createdAt,
        ).compareTo(_taskBoardListViewDateValue(b.createdAt)),
        'assignees' => a.assignees.length.compareTo(b.assignees.length),
        _ => _taskBoardListViewDateValue(
          a.createdAt,
        ).compareTo(_taskBoardListViewDateValue(b.createdAt)),
      };

      return sort.ascending ? comparison : -comparison;
    });

  return sorted;
}

int _taskBoardListViewPriorityValue(String? priority) {
  return switch (priority?.toLowerCase()) {
    'critical' => 4,
    'high' => 3,
    'normal' => 2,
    'low' => 1,
    _ => 0,
  };
}

int _taskBoardListViewDateValue(DateTime? date) {
  return date?.millisecondsSinceEpoch ?? 0;
}

String taskBoardListViewSortFieldLabel(BuildContext context, String field) {
  return switch (field) {
    'name' => context.l10n.taskBoardDetailTaskTitleLabel,
    'priority' => context.l10n.taskBoardDetailPriority,
    'end_date' => context.l10n.taskBoardDetailTaskEndDate,
    'start_date' => context.l10n.taskBoardDetailTaskStartDate,
    'assignees' => context.l10n.taskBoardDetailTaskAssignees,
    'created_at' => context.l10n.taskBoardsCreatedAt,
    _ => field,
  };
}
