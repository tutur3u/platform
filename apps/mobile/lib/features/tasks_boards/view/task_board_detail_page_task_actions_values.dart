part of 'task_board_detail_page.dart';

typedef _TaskQuickPerson = ({String id, String name, String? avatarUrl});
typedef _TaskQuickLabel = ({String id, String name, Color? color});

/// The task's assignees, named from the board's members when available.
List<_TaskQuickPerson> _taskQuickAssignees(
  TaskBoardTask task,
  TaskBoardDetail? board,
) {
  final members = {
    for (final member in board?.members ?? const <WorkspaceUserOption>[])
      member.id: member,
  };
  final embedded = {for (final person in task.assignees) person.id: person};
  return [
    for (final id in task.assigneeIds)
      if (members[id] case final member?)
        (id: id, name: member.label, avatarUrl: member.avatarUrl)
      else if (embedded[id] case final person?)
        (
          id: id,
          name: person.displayName?.trim().isNotEmpty == true
              ? person.displayName!.trim()
              : (person.email ?? id),
          avatarUrl: person.avatarUrl,
        ),
  ];
}

/// The task's labels with their colours, named from the board's labels.
List<_TaskQuickLabel> _taskQuickLabels(
  TaskBoardTask task,
  TaskBoardDetail? board,
) {
  final boardLabels = {
    for (final label in board?.labels ?? const <TaskLabel>[]) label.id: label,
  };
  final embedded = {for (final label in task.labels) label.id: label};
  return [
    for (final id in task.labelIds)
      if (boardLabels[id] case final label?)
        (id: id, name: label.name, color: parseTaskLabelColor(label.color))
      else if (embedded[id] case final label?)
        (
          id: id,
          name: label.name?.trim().isNotEmpty == true ? label.name! : id,
          color: parseTaskLabelColor(label.color),
        ),
  ];
}

/// Up to three overlapping assignee avatars. Names are in the row's text,
/// so the stack carries no overflow count.
class _TaskQuickAvatarStack extends StatelessWidget {
  const _TaskQuickAvatarStack({required this.assignees});

  final List<_TaskQuickPerson> assignees;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final shown = assignees.take(3).toList(growable: false);
    const size = 28.0;
    const step = 18.0;
    return ExcludeSemantics(
      child: SizedBox(
        width: size + step * (shown.length - 1),
        height: size,
        child: Stack(
          children: [
            for (final (index, person) in shown.indexed)
              Positioned(
                left: step * index,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: c.popover, width: 2),
                  ),
                  child: NetworkAvatar(
                    avatarUrl: person.avatarUrl,
                    radius: size / 2 - 2,
                    backgroundColor: c.muted,
                    child: Text(
                      person.name
                              .trim()
                              .characters
                              .firstOrNull
                              ?.toUpperCase() ??
                          '',
                      style: TextStyle(fontSize: 11, color: c.foreground),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Label names on one line, each after a dot in the label's colour.
class _TaskQuickLabelLine extends StatelessWidget {
  const _TaskQuickLabelLine({required this.labels});

  final List<_TaskQuickLabel> labels;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    return Text.rich(
      TextSpan(
        children: [
          for (final (index, label) in labels.indexed) ...[
            if (index > 0) const TextSpan(text: '   '),
            WidgetSpan(
              alignment: PlaceholderAlignment.middle,
              child: Padding(
                padding: const EdgeInsets.only(right: AppSpacing.xs),
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: label.color ?? c.mutedForeground,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ),
            TextSpan(text: label.name),
          ],
        ],
      ),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }
}
