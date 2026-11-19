part of 'task_board_detail_page.dart';

/// The two task dates the detail property rows edit.
enum _TaskQuickDate { start, due }

/// Picks and clears the task's dates through the row update, so the
/// cubit applies them optimistically and restores the task on failure.
extension _TaskQuickDateEdits on _TaskBoardDetailPageViewState {
  /// Opens the edit form's date picker for [field]. The picked day is
  /// saved in the timezone setting: a start at the day's first instant, a
  /// due date at its last second. As in the edit form, a start after the
  /// due day pulls the due date onto it, and a due date before the start
  /// pulls the start onto it, so the range stays valid.
  Future<void> _pickTaskQuickDate(
    BuildContext context,
    TaskBoardTask task,
    _TaskQuickDate field,
  ) async {
    final l10n = context.l10n;
    final zone = taskTimezone(context);
    final today = taskDay(DateTime.now(), zone);
    final isStart = field == _TaskQuickDate.start;
    final current = isStart ? task.startDate : task.endDate;
    final currentDay = current == null ? null : taskDay(current, zone);
    final firstDate = DateTime(2000);
    final lastDate = DateTime(2100);
    final initialDate = currentDay ?? today;

    final picked = await showAdaptiveSheet<DateTime>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (_) => _TaskDatePickerSheet(
        title: isStart
            ? l10n.taskBoardDetailTaskStartDate
            : l10n.taskQuickActionsDueDate,
        initialDate: initialDate.isBefore(firstDate)
            ? firstDate
            : initialDate.isAfter(lastDate)
            ? lastDate
            : initialDate,
        firstDate: firstDate,
        lastDate: lastDate,
        currentDate: today,
      ),
    );
    if (picked == null || !context.mounted) return;
    final day = DateTime(picked.year, picked.month, picked.day);
    if (day == currentDay) return;

    var startDate = task.startDate;
    var endDate = task.endDate;
    if (isStart) {
      startDate = taskStartOfDayIn(day, zone);
      if (endDate != null && day.isAfter(taskDay(endDate, zone))) {
        endDate = taskEndOfDayIn(day, zone);
      }
    } else {
      endDate = taskEndOfDayIn(day, zone);
      if (startDate != null && day.isBefore(taskDay(startDate, zone))) {
        startDate = taskStartOfDayIn(day, zone);
      }
    }
    await _runTaskRowUpdate(
      context,
      task,
      successMessage: null,
      startDate: startDate,
      endDate: endDate,
    );
  }

  Future<void> _clearTaskQuickDate(
    BuildContext context,
    TaskBoardTask task,
    _TaskQuickDate field,
  ) => _runTaskRowUpdate(
    context,
    task,
    successMessage: null,
    clearStartDate: field == _TaskQuickDate.start,
    clearEndDate: field == _TaskQuickDate.due,
  );
}
