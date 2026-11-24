part of 'task_board_detail_page.dart';

/// Widest a property chip grows before its value ellipsizes.
const double _taskDetailChipMaxWidth = 220;

/// Every task property at a glance, as one compact line of chips under
/// the title: list and status, priority, due and start dates, assignees,
/// labels, projects and estimate. The line scrolls sideways when it does
/// not fit, so the description stays near the top of the surface.
///
/// Each chip opens the same picker as its property row. An unset
/// property shows its name, muted, so it can be set from here too.
class _TaskDetailMetaChips extends StatelessWidget {
  const _TaskDetailMetaChips({
    required this.task,
    required this.board,
    required this.list,
    required this.enabled,
    required this.actions,
    this.reference,
  });

  final TaskBoardTask task;
  final TaskBoardDetail? board;
  final TaskBoardList? list;
  final bool enabled;
  final _TaskDetailActions actions;

  /// The task's board reference, shown first when the surface's title
  /// does not already carry it.
  final String? reference;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final board = this.board;
    final status = TaskBoardList.normalizeSupportedStatus(list?.status);
    final priority = TaskPriorityLevel.tryParse(task.priority);
    final statusColor = status == null
        ? c.mutedForeground
        : _taskBoardListStatusBadgeColors(context, status).textColor;
    final assignees = _taskQuickAssignees(task, board);
    final labels = _taskQuickLabels(task, board);
    final projects = _taskDetailProjects(task, board);
    final estimate = board == null ? null : _taskEstimationLabel(task, board);

    VoidCallback? tap(void Function(TaskBoardTask task)? action) =>
        enabled && action != null ? () => action(task) : null;

    Icon icon(IconData data, {Color? color}) =>
        Icon(data, size: 14, color: color ?? c.mutedForeground);

    final chips = <Widget>[
      _TaskDetailPropertyChip(
        id: 'status',
        property: l10n.taskBoardDetailTaskListLabel,
        avatar: icon(_taskQuickStatusIcon(status ?? ''), color: statusColor),
        label: _taskDetailListName(context, list),
        onPressed: tap(actions.onPickList),
      ),
      _TaskDetailPropertyChip(
        id: 'priority',
        property: l10n.taskBoardDetailPriority,
        avatar: icon(
          priority?.icon ?? TaskPriorityLevel.noneIcon,
          color: priority?.color(context.dynamicColors),
        ),
        label: priority?.label(l10n) ?? l10n.taskBoardDetailPriority,
        unset: priority == null,
        onPressed: tap(actions.onPickPriority),
      ),
      for (final field in [_TaskQuickDate.due, _TaskQuickDate.start])
        _dateChip(context, field),
      if (actions.onAssignees != null)
        _TaskDetailPropertyChip(
          id: 'assignees',
          property: l10n.taskBoardDetailTaskAssignees,
          avatar: assignees.isEmpty
              ? icon(LucideIcons.users)
              : _TaskDetailChipAvatar(person: assignees.first),
          label: assignees.isEmpty
              ? l10n.taskQuickActionsUnassigned
              : _taskDetailChipSummary(assignees.map((person) => person.name)),
          unset: assignees.isEmpty,
          onPressed: tap(actions.onAssignees),
        ),
      if (actions.onLabels != null)
        _TaskDetailPropertyChip(
          id: 'labels',
          property: l10n.taskBoardDetailTaskLabels,
          avatar: labels.isEmpty
              ? icon(LucideIcons.tag)
              : _TaskDetailChipDot(
                  color: labels.first.color ?? c.mutedForeground,
                ),
          label: labels.isEmpty
              ? l10n.taskBoardDetailTaskLabels
              : _taskDetailChipSummary(labels.map((label) => label.name)),
          unset: labels.isEmpty,
          onPressed: tap(actions.onLabels),
        ),
      if (actions.onProjects != null)
        _TaskDetailPropertyChip(
          id: 'projects',
          property: l10n.taskBoardDetailTaskProjects,
          avatar: icon(LucideIcons.folderKanban),
          label: projects.isEmpty
              ? l10n.taskBoardDetailTaskProjects
              : _taskDetailChipSummary(projects),
          unset: projects.isEmpty,
          onPressed: tap(actions.onProjects),
        ),
      if (actions.onEstimate != null)
        _TaskDetailPropertyChip(
          id: 'estimate',
          property: l10n.taskBoardDetailTaskEstimation,
          avatar: icon(LucideIcons.gauge),
          label: estimate ?? l10n.taskBoardDetailTaskEstimation,
          unset: estimate == null,
          onPressed: tap(actions.onEstimate),
        ),
    ];

    return SingleChildScrollView(
      key: const ValueKey('task-detail-property-chips'),
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      child: Row(
        spacing: AppSpacing.sm,
        children: [
          if (reference case final reference?)
            Text(
              reference,
              style: tokens.typography.xSmall.copyWith(
                color: c.mutedForeground,
                fontWeight: FontWeight.w600,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ...chips,
        ],
      ),
    );
  }

  /// The due or start date chip, read in the timezone setting. A late due
  /// date reads in the destructive colour unless the task is done.
  Widget _dateChip(BuildContext context, _TaskQuickDate field) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final zone = taskTimezone(context);
    final now = DateTime.now();
    final isStart = field == _TaskQuickDate.start;
    final date = isStart ? task.startDate : task.endDate;
    final day = date == null ? null : taskDay(date, zone);
    final late =
        !isStart &&
        taskIsOverdue(endDate: task.endDate, now: now, zone: zone) &&
        !_taskIsCompletedInBoard(task, list);
    final property = isStart
        ? l10n.taskBoardDetailTaskStartDate
        : l10n.taskQuickActionsDueDate;
    return _TaskDetailPropertyChip(
      id: isStart ? 'start' : 'due',
      property: property,
      avatar: Icon(
        isStart ? LucideIcons.calendar : LucideIcons.calendarClock,
        size: 14,
        color: late ? c.destructive : c.mutedForeground,
      ),
      label: day == null
          ? property
          : _taskSmartDate(context, day, now: taskDay(now, zone)),
      unset: day == null,
      labelColor: late ? c.destructive : null,
      onPressed: enabled ? () => actions.onPickDate(task, field) : null,
    );
  }
}

/// One property chip. The tooltip and semantics name the property, since
/// the visible label is its value.
class _TaskDetailPropertyChip extends StatelessWidget {
  const _TaskDetailPropertyChip({
    required this.id,
    required this.property,
    required this.avatar,
    required this.label,
    required this.onPressed,
    this.unset = false,
    this.labelColor,
  });

  final String id;
  final String property;
  final Widget avatar;
  final String label;
  final VoidCallback? onPressed;

  /// An unset property shows its name, muted.
  final bool unset;
  final Color? labelColor;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    // The chip's own row flexes its label, so it needs a bounded width
    // inside the sideways scroll.
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: _taskDetailChipMaxWidth),
      child: AppChip(
        key: ValueKey('task-detail-$id-chip'),
        tooltip: property,
        avatar: avatar,
        label: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          semanticsLabel: unset ? property : '$property: $label',
          style: TextStyle(
            color: unset ? c.mutedForeground : labelColor,
            fontWeight: unset ? FontWeight.w400 : FontWeight.w500,
          ),
        ),
        onPressed: onPressed,
      ),
    );
  }
}

/// The first value and how many more, such as "Finance +2".
String _taskDetailChipSummary(Iterable<String> values) {
  final list = values.toList(growable: false);
  if (list.isEmpty) return '';
  return list.length == 1 ? list.first : '${list.first} +${list.length - 1}';
}

/// A small avatar for the first assignee inside a chip.
class _TaskDetailChipAvatar extends StatelessWidget {
  const _TaskDetailChipAvatar({required this.person});

  final _TaskQuickPerson person;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    return ExcludeSemantics(
      child: NetworkAvatar(
        avatarUrl: person.avatarUrl,
        radius: 9,
        backgroundColor: c.muted,
        child: Text(
          person.name.trim().characters.firstOrNull?.toUpperCase() ?? '',
          style: TextStyle(fontSize: 9, color: c.foreground),
        ),
      ),
    );
  }
}

/// A label's colour as a dot inside a chip.
class _TaskDetailChipDot extends StatelessWidget {
  const _TaskDetailChipDot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: DecoratedBox(
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        child: const SizedBox.square(dimension: 10),
      ),
    );
  }
}

/// Every property as grouped rows, folded under one row so the
/// description stays near the top. The chip line above edits the same
/// properties; this list adds each one's full value and date clearing.
class _TaskDetailPropertiesDisclosure extends StatefulWidget {
  const _TaskDetailPropertiesDisclosure({required this.properties, super.key});

  final Widget properties;

  @override
  State<_TaskDetailPropertiesDisclosure> createState() =>
      _TaskDetailPropertiesDisclosureState();
}

class _TaskDetailPropertiesDisclosureState
    extends State<_TaskDetailPropertiesDisclosure> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final muted = AppTokens.of(context).colorScheme.mutedForeground;
    final body = _expanded
        ? Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: widget.properties,
          )
        : const SizedBox(width: double.infinity);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppGroupedCard(
          children: [
            Semantics(
              expanded: _expanded,
              child: AppGroupedRow(
                key: const ValueKey('task-detail-properties-toggle'),
                leading: const AppIconTile(icon: LucideIcons.slidersHorizontal),
                title: Text(context.l10n.taskDetailAllProperties),
                trailing: Icon(
                  _expanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                  size: 18,
                  color: muted,
                ),
                onTap: () => setState(() => _expanded = !_expanded),
              ),
            ),
          ],
        ),
        // The list grows into place; under reduced motion it appears at
        // once.
        if (MediaQuery.disableAnimationsOf(context))
          body
        else
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: body,
          ),
      ],
    );
  }
}
