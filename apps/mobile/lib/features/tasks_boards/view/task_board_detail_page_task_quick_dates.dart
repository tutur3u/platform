part of 'task_board_detail_page.dart';

/// The two task dates the quick sheet edits.
enum _TaskQuickDate { start, due }

/// Start and due date rows of the quick sheet, read in the timezone
/// setting. A row opens the edit form's date picker; its clear button
/// removes that date. While an edit saves ([enabled] false) the rows dim
/// and take no taps.
///
/// Together they replace drag-to-reschedule on the timeline.
class _TaskQuickDatesCard extends StatelessWidget {
  const _TaskQuickDatesCard({
    required this.task,
    required this.list,
    required this.enabled,
    required this.callbacks,
  });

  final TaskBoardTask task;
  final TaskBoardList? list;
  final bool enabled;
  final _TaskQuickActionCallbacks callbacks;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final zone = taskTimezone(context);
    final now = DateTime.now();
    final today = taskDay(now, zone);
    final overdue =
        taskIsOverdue(endDate: task.endDate, now: now, zone: zone) &&
        !_taskIsCompletedInBoard(task, list);

    Widget row(_TaskQuickDate field) {
      final isStart = field == _TaskQuickDate.start;
      final value = isStart ? task.startDate : task.endDate;
      final day = value == null ? null : taskDay(value, zone);
      final late = !isStart && overdue;
      return AppGroupedRow(
        key: ValueKey('task-quick-${field.name}-date'),
        leading: AppIconTile(
          icon: isStart ? LucideIcons.calendar : LucideIcons.calendarClock,
          tone: late ? AppTone.destructive : AppTone.info,
        ),
        title: Text(
          isStart
              ? l10n.taskBoardDetailTaskStartDate
              : l10n.taskQuickActionsDueDate,
        ),
        subtitle: Text(
          day == null
              ? l10n.taskQuickActionsNoDate
              : '${DateFormat.yMMMd(l10n.localeName).format(day)}'
                    ' · ${_taskSmartDate(context, day, now: today)}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: late ? TextStyle(color: c.destructive) : null,
        ),
        trailing: day == null
            ? null
            : AppIconButton(
                key: ValueKey('task-quick-clear-${field.name}-date'),
                tooltip: isStart
                    ? l10n.taskQuickActionsRemoveStartDate
                    : l10n.taskBoardDetailRemoveDueDate,
                icon: const Icon(LucideIcons.x),
                onPressed: enabled
                    ? () => callbacks.onClearDate(task, field)
                    : null,
              ),
        showChevron: day == null,
        onTap: enabled ? () => callbacks.onPickDate(task, field) : null,
      );
    }

    final card = AppGroupedCard(
      children: [row(_TaskQuickDate.start), row(_TaskQuickDate.due)],
    );
    return enabled ? card : Opacity(opacity: 0.55, child: card);
  }
}

/// Picks and clears the quick sheet's dates through the row update, so the
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
