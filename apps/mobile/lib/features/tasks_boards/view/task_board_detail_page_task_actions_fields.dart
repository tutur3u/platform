part of 'task_board_detail_page.dart';

/// The task's properties as grouped rows: list and status, priority,
/// assignees, start and due dates, labels, projects and estimate. Each row
/// shows the current value and opens that property's editor. While an edit
/// saves ([enabled] false) the rows dim and take no taps.
class _TaskDetailPropertiesCard extends StatelessWidget {
  const _TaskDetailPropertiesCard({
    required this.task,
    required this.board,
    required this.list,
    required this.enabled,
    required this.actions,
  });

  final TaskBoardTask task;
  final TaskBoardDetail? board;
  final TaskBoardList? list;
  final bool enabled;
  final _TaskDetailActions actions;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final status = TaskBoardList.normalizeSupportedStatus(list?.status);
    final priority = TaskPriorityLevel.tryParse(task.priority);
    final assignees = _taskQuickAssignees(task, board);
    final labels = _taskQuickLabels(task, board);
    final projects = _taskDetailProjects(task, board);
    final estimate = switch (board) {
      final board? => _taskEstimationLabel(task, board),
      null => null,
    };

    VoidCallback? tap(void Function(TaskBoardTask task)? action) =>
        enabled && action != null ? () => action(task) : null;

    Text value(String text, {Color? color}) => Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: color == null ? null : TextStyle(color: color),
    );

    final card = AppGroupedCard(
      children: [
        AppGroupedRow(
          key: const ValueKey('task-quick-list'),
          leading: AppIconTile(
            icon: _taskQuickStatusIcon(status ?? ''),
            tone: _taskDetailStatusTone(status),
          ),
          title: Text(l10n.taskBoardDetailTaskListLabel),
          subtitle: value(
            [
              _taskDetailListName(context, list),
              if (status != null) _taskBoardListStatusLabel(context, status),
            ].join(' · '),
          ),
          showChevron: true,
          onTap: tap(actions.onPickList),
        ),
        AppGroupedRow(
          key: const ValueKey('task-quick-priority'),
          leading: AppIconTile(
            icon: priority?.icon ?? TaskPriorityLevel.noneIcon,
            tone: AppTone.warning,
          ),
          title: Text(l10n.taskBoardDetailPriority),
          subtitle: value(
            priority?.label(l10n) ?? TaskPriorityLevel.noneLabel(l10n),
            color: priority?.color(context.dynamicColors),
          ),
          showChevron: true,
          onTap: tap(actions.onPickPriority),
        ),
        if (actions.onAssignees != null)
          AppGroupedRow(
            key: const ValueKey('task-quick-assignees'),
            leading: const AppIconTile(
              icon: LucideIcons.users,
              tone: AppTone.primary,
            ),
            title: Text(l10n.taskBoardDetailTaskAssignees),
            subtitle: value(
              assignees.isEmpty
                  ? l10n.taskQuickActionsUnassigned
                  : assignees.map((member) => member.name).join(', '),
            ),
            trailing: assignees.isEmpty
                ? null
                : _TaskQuickAvatarStack(assignees: assignees),
            showChevron: true,
            onTap: tap(actions.onAssignees),
          ),
        for (final field in _TaskQuickDate.values)
          _taskDetailDateRow(context, field, c),
        if (actions.onLabels != null)
          AppGroupedRow(
            key: const ValueKey('task-quick-labels'),
            leading: const AppIconTile(
              icon: LucideIcons.tag,
              tone: AppTone.warning,
            ),
            title: Text(l10n.taskBoardDetailTaskLabels),
            subtitle: labels.isEmpty
                ? Text(l10n.taskQuickActionsNoLabels)
                : _TaskDetailLabelChips(labels: labels),
            showChevron: true,
            onTap: tap(actions.onLabels),
          ),
        if (actions.onProjects != null)
          AppGroupedRow(
            key: const ValueKey('task-quick-projects'),
            leading: const AppIconTile(
              icon: LucideIcons.folderKanban,
              tone: AppTone.info,
            ),
            title: Text(l10n.taskBoardDetailTaskProjects),
            subtitle: value(
              projects.isEmpty
                  ? l10n.taskDetailNoProjects
                  : projects.join(', '),
            ),
            showChevron: true,
            onTap: tap(actions.onProjects),
          ),
        if (actions.onEstimate != null)
          AppGroupedRow(
            key: const ValueKey('task-quick-estimate'),
            leading: const AppIconTile(icon: LucideIcons.gauge),
            title: Text(l10n.taskBoardDetailTaskEstimation),
            subtitle: value(estimate ?? l10n.taskDetailNoEstimate),
            showChevron: true,
            onTap: tap(actions.onEstimate),
          ),
      ],
    );
    return enabled ? card : Opacity(opacity: 0.55, child: card);
  }

  /// A start or due date row, read in the timezone setting. The row opens
  /// the date picker; its clear button removes that date.
  Widget _taskDetailDateRow(
    BuildContext context,
    _TaskQuickDate field,
    AppColorTokens c,
  ) {
    final l10n = context.l10n;
    final zone = taskTimezone(context);
    final now = DateTime.now();
    final isStart = field == _TaskQuickDate.start;
    final date = isStart ? task.startDate : task.endDate;
    final day = date == null ? null : taskDay(date, zone);
    final late =
        !isStart &&
        taskIsOverdue(endDate: task.endDate, now: now, zone: zone) &&
        !_taskIsCompletedInBoard(task, list);
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
                  ' · ${_taskSmartDate(context, day, now: taskDay(now, zone))}',
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
                  ? () => actions.onClearDate(task, field)
                  : null,
            ),
      showChevron: day == null,
      onTap: enabled ? () => actions.onPickDate(task, field) : null,
    );
  }
}

/// Lucide glyphs for list statuses.
IconData _taskQuickStatusIcon(String status) => switch (status) {
  'not_started' => LucideIcons.circleDashed,
  'active' => LucideIcons.circleDot,
  'review' => LucideIcons.circleEllipsis,
  'done' => LucideIcons.circleCheck,
  'closed' => LucideIcons.circleX,
  _ => LucideIcons.circle,
};

AppTone _taskDetailStatusTone(String? status) => switch (status) {
  'active' => AppTone.info,
  'review' => AppTone.warning,
  'done' => AppTone.success,
  'closed' => AppTone.destructive,
  _ => AppTone.neutral,
};

String _taskDetailListName(BuildContext context, TaskBoardList? list) {
  final name = list?.name?.trim();
  return name == null || name.isEmpty
      ? context.l10n.taskBoardDetailUntitledList
      : name;
}

/// The task's project names, from the board's projects when available.
List<String> _taskDetailProjects(TaskBoardTask task, TaskBoardDetail? board) {
  final boardProjects = {
    for (final project in board?.projects ?? const <TaskProjectSummary>[])
      project.id: project,
  };
  final embedded = {for (final project in task.projects) project.id: project};
  return [
    for (final id in task.projectIds)
      if (boardProjects[id] case final project?)
        if (project.name.trim().isEmpty) id else project.name.trim()
      else if (embedded[id] case final project?)
        _taskProjectLabel(project),
  ];
}

/// Label chips tinted with each label's colour, on one wrapping line.
class _TaskDetailLabelChips extends StatelessWidget {
  const _TaskDetailLabelChips({required this.labels});

  final List<_TaskQuickLabel> labels;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xxs),
      child: Wrap(
        spacing: AppSpacing.xs,
        runSpacing: AppSpacing.xs,
        children: [
          for (final label in labels)
            DecoratedBox(
              decoration: BoxDecoration(
                color: (label.color ?? c.mutedForeground).withValues(
                  alpha: c.isDark ? 0.22 : 0.14,
                ),
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: AppSpacing.xxs,
                ),
                child: Text(
                  label.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: tokens.typography.xSmall.copyWith(
                    color: c.foreground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
