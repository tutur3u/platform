part of 'task_board_detail_page.dart';

/// The task's fields as one grouped card of icon rows: List first (always
/// shown), then Due, Start, Priority, Estimation, Assignees, Labels and
/// Projects when set. Values sit trailing; chip collections sit under the
/// field name so they wrap at any text size. Editing stays in the editor.
class _TaskDetailFieldsCard extends StatelessWidget {
  const _TaskDetailFieldsCard({
    required this.task,
    required this.board,
    required this.lists,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toLanguageTag();
    String date(DateTime value) => DateFormat.yMMMd(locale).format(value);
    final listName = lists
        .where((list) => list.id == task.listId)
        .map((list) => list.name?.trim())
        .firstOrNull;
    final assignees = task.assignees
        .where(
          (assignee) =>
              (assignee.displayName?.trim().isNotEmpty ?? false) ||
              assignee.id.trim().isNotEmpty,
        )
        .toList(growable: false);

    Widget row(
      String key,
      IconData icon,
      AppTone tone,
      String label, {
      String? value,
      Widget? trailing,
      Widget? below,
    }) => AppGroupedRow(
      key: ValueKey('task-detail-field-$key'),
      leading: AppIconTile(icon: icon, tone: tone),
      title: Text(label),
      subtitle: below == null
          ? null
          : Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: below,
            ),
      trailing: trailing ?? (value == null ? null : Text(value)),
    );

    Widget chips(Iterable<Widget> children) => Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: children.toList(growable: false),
    );

    return AppGroupedCard(
      children: [
        row(
          'list',
          LucideIcons.list,
          AppTone.info,
          l10n.taskBoardDetailTaskList,
          value: listName?.isNotEmpty == true
              ? listName
              : l10n.taskBoardDetailUntitledList,
        ),
        if (task.endDate case final endDate?)
          row(
            'due',
            LucideIcons.calendarClock,
            AppTone.destructive,
            l10n.taskBoardDetailTaskEndDate,
            value: date(endDate),
          ),
        if (task.startDate case final startDate?)
          row(
            'start',
            LucideIcons.calendarArrowUp,
            AppTone.primary,
            l10n.taskBoardDetailTaskStartDate,
            value: date(startDate),
          ),
        if (task.priority?.trim().isNotEmpty == true)
          row(
            'priority',
            LucideIcons.flag,
            AppTone.warning,
            l10n.taskBoardDetailPriority,
            trailing: _TaskPriorityChip(priority: task.priority),
          ),
        if (task.estimationPoints case final points?)
          row(
            'estimation',
            LucideIcons.gauge,
            AppTone.neutral,
            l10n.taskBoardDetailTaskEstimation,
            value: _taskEstimationPointLabel(points: points, board: board),
          ),
        if (assignees.isNotEmpty)
          row(
            'assignees',
            LucideIcons.users,
            AppTone.success,
            l10n.taskBoardDetailTaskAssignees,
            below: chips(
              assignees.map(
                (assignee) => _AssigneeChip(
                  label: assignee.displayName?.trim().isNotEmpty == true
                      ? assignee.displayName!.trim()
                      : assignee.id,
                  avatarUrl: assignee.avatarUrl,
                ),
              ),
            ),
          ),
        if (task.labels.isNotEmpty)
          row(
            'labels',
            LucideIcons.tag,
            AppTone.neutral,
            l10n.taskBoardDetailTaskLabels,
            below: chips(task.labels.map(_TaskLabelBadge.new)),
          ),
        if (task.projects.isNotEmpty)
          row(
            'projects',
            LucideIcons.folderKanban,
            AppTone.primary,
            l10n.taskBoardDetailTaskProjects,
            below: chips(
              task.projects.map(
                (project) => _ProjectBadge(label: _taskProjectLabel(project)),
              ),
            ),
          ),
      ],
    );
  }
}
