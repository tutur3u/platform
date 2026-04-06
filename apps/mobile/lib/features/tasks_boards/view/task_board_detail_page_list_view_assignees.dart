part of 'task_board_detail_page.dart';

class _ListViewAssigneeAvatarStack extends StatelessWidget {
  const _ListViewAssigneeAvatarStack({required this.assignees});

  final List<TaskBoardTaskAssignee> assignees;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final visible = assignees.take(3).toList(growable: false);
    final overflowCount = assignees.length - visible.length;
    Widget child = SizedBox(
      height: 20,
      width: visible.length * 14 + 14,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var i = 0; i < visible.length; i++)
            Positioned(
              left: i * 14,
              child: _ListViewAssigneeAvatar(assignee: visible[i]),
            ),
          if (overflowCount > 0)
            Positioned(
              left: visible.length * 14,
              child: Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: theme.colorScheme.muted.withValues(alpha: 0.4),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    '+$overflowCount',
                    style: theme.typography.small.copyWith(
                      fontSize: 8,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );

    if (overflowCount > 0) {
      child = Tooltip(
        message: context.l10n.taskBoardDetailTaskAssigneeCount(
          assignees.length,
        ),
        child: child,
      );
    }

    return child;
  }
}

class _ListViewAssigneeAvatar extends StatelessWidget {
  const _ListViewAssigneeAvatar({required this.assignee});

  final TaskBoardTaskAssignee assignee;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colors = context.dynamicColors;
    final name = (assignee.displayName?.trim().isNotEmpty == true)
        ? assignee.displayName!.trim()
        : assignee.id;
    final avatarUrl = assignee.avatarUrl?.trim() ?? '';
    final hasAvatar = avatarUrl.isNotEmpty;

    final initials = name.isNotEmpty ? name.substring(0, 1).toUpperCase() : '?';

    final avatarColor = colors.blue;

    if (hasAvatar) {
      return Container(
        width: 24,
        height: 24,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: theme.colorScheme.card,
            width: 2,
          ),
        ),
        child: ClipOval(
          child: Image.network(
            avatarUrl,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => ColoredBox(
              color: avatarColor,
              child: Center(
                child: Text(
                  initials,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: avatarColor,
        border: Border.all(
          color: theme.colorScheme.card,
          width: 2,
        ),
      ),
      child: Center(
        child: Text(
          initials,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 9,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
