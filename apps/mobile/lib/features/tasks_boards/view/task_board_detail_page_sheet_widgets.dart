part of 'task_board_detail_page.dart';

class _CenteredButtonText extends StatelessWidget {
  const _CenteredButtonText(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        label,
        textAlign: TextAlign.center,
      ),
    );
  }
}

class _TaskButtonLoadingIndicator extends StatelessWidget {
  const _TaskButtonLoadingIndicator({this.size = 18});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SizedBox.square(
        dimension: size,
        child: NovaLoadingIndicator(size: size),
      ),
    );
  }
}

class _DateFieldRow extends StatelessWidget {
  const _DateFieldRow({
    required this.label,
    required this.value,
    required this.onPick,
    required this.onClear,
  });

  final String label;
  final DateTime? value;
  final VoidCallback? onPick;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final formatter = DateFormat.yMd();
    final buttonLabel = value == null
        ? context.l10n.taskBoardDetailNoDate
        : formatter.format(value!);

    return Row(
      children: [
        Expanded(
          child: shad.OutlineButton(
            onPressed: onPick,
            child: Center(
              child: Text(
                '$label · $buttonLabel',
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ),
        const shad.Gap(8),
        shad.IconButton.ghost(
          icon: const Icon(Icons.close),
          onPressed: onClear,
        ),
      ],
    );
  }
}

class _TaskDatePickerSheet extends StatelessWidget {
  const _TaskDatePickerSheet({
    required this.title,
    required this.initialDate,
    required this.firstDate,
    required this.lastDate,
  });

  final String title;
  final DateTime initialDate;
  final DateTime firstDate;
  final DateTime lastDate;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: theme.typography.large.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                shad.IconButton.ghost(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.maybePop(context),
                ),
              ],
            ),
            const shad.Gap(8),
            CalendarDatePicker(
              initialDate: initialDate,
              firstDate: firstDate,
              lastDate: lastDate,
              onDateChanged: (date) => Navigator.of(context).pop(date),
            ),
          ],
        ),
      ),
    );
  }
}

class _EditorSectionCard extends StatelessWidget {
  const _EditorSectionCard({
    required this.child,
    this.title,
  });

  final String? title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Text(
              title!,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(8),
          ],
          child,
        ],
      ),
    );
  }
}

class _EditFieldButton extends StatelessWidget {
  const _EditFieldButton({
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return shad.OutlineButton(
      onPressed: onPressed,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            softWrap: false,
          ),
          Align(
            alignment: Alignment.centerRight,
            child: Icon(
              Icons.edit,
              size: 16,
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

class _SelectionFieldButton extends StatelessWidget {
  const _SelectionFieldButton({
    required this.label,
    required this.value,
    required this.enabled,
    required this.onPressed,
  });

  final String label;
  final String value;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return shad.OutlineButton(
      onPressed: enabled ? onPressed : null,
      child: Center(
        child: Text(
          '$label · $value',
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}

class _TaskEditorTabLabel extends StatelessWidget {
  const _TaskEditorTabLabel({
    required this.label,
    required this.count,
  });

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label),
        if (count > 0) ...[
          const shad.Gap(6),
          shad.OutlineBadge(child: Text('$count')),
        ],
      ],
    );
  }
}

class _SelectedAssigneesList extends StatelessWidget {
  const _SelectedAssigneesList({required this.assignees});

  final List<TaskBoardTaskAssignee> assignees;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        children: [
          if (assignees.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: theme.colorScheme.secondary.withValues(alpha: 0.18),
                border: Border.all(color: theme.colorScheme.border),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                context.l10n.taskBoardDetailNone,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            )
          else
            ...assignees.map(
              (assignee) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _SelectedAssigneeRow(assignee: assignee),
              ),
            ),
        ],
      ),
    );
  }
}

class _SelectedAssigneeRow extends StatelessWidget {
  const _SelectedAssigneeRow({required this.assignee});

  final TaskBoardTaskAssignee assignee;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final name = assignee.displayName?.trim().isNotEmpty == true
        ? assignee.displayName!.trim()
        : assignee.id;
    final email = assignee.email?.trim();
    final secondary = email?.isNotEmpty == true ? email! : assignee.id;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.secondary.withValues(alpha: 0.18),
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          _SelectedAssigneeAvatar(
            name: name,
            avatarUrl: assignee.avatarUrl,
          ),
          const shad.Gap(10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const shad.Gap(2),
                Text(
                  secondary,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SelectedAssigneeAvatar extends StatelessWidget {
  const _SelectedAssigneeAvatar({
    required this.name,
    required this.avatarUrl,
  });

  final String name;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final normalizedAvatarUrl = avatarUrl?.trim() ?? '';
    final fallback = Text(
      name.trim().isNotEmpty ? name.trim().substring(0, 1).toUpperCase() : '?',
      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
    );

    if (normalizedAvatarUrl.isEmpty) {
      return CircleAvatar(radius: 18, child: fallback);
    }

    return CircleAvatar(
      radius: 18,
      backgroundImage: NetworkImage(normalizedAvatarUrl),
      onBackgroundImageError: (error, stackTrace) {},
      child: const SizedBox.shrink(),
    );
  }
}

class _RelationshipSectionCard extends StatelessWidget {
  const _RelationshipSectionCard({
    required this.title,
    required this.children,
    this.icon,
  });

  final String title;
  final List<Widget> children;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return _EditorSectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Icon(
                  icon,
                  size: 14,
                  color: shad.Theme.of(context).colorScheme.mutedForeground,
                ),
                const shad.Gap(6),
              ],
              Text(
                title,
                style: shad.Theme.of(context).typography.small.copyWith(
                  color: shad.Theme.of(context).colorScheme.mutedForeground,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const shad.Gap(8),
          ...children,
        ],
      ),
    );
  }
}

class _RelationshipTaskTile extends StatelessWidget {
  const _RelationshipTaskTile({
    required this.task,
    this.onRemove,
    this.onNavigate,
  });

  final RelatedTaskInfo task;
  final VoidCallback? onRemove;
  final VoidCallback? onNavigate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final title = task.name.trim().isEmpty
        ? context.l10n.taskBoardDetailUntitledTask
        : task.name.trim();
    final metadata = [
      if (task.boardName?.trim().isNotEmpty == true) task.boardName!.trim(),
      if (task.displayNumber != null) '#${task.displayNumber}',
    ];

    final content = Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: shad.Theme.of(context).colorScheme.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, overflow: TextOverflow.ellipsis),
                if (metadata.isNotEmpty)
                  Text(
                    metadata.join(' · '),
                    style: shad.Theme.of(context).typography.xSmall.copyWith(
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                  ),
              ],
            ),
          ),
          if (onNavigate != null)
            Semantics(
              button: true,
              label: l10n.taskBoardDetailOpenRelatedTask,
              child: Tooltip(
                message: l10n.taskBoardDetailOpenRelatedTask,
                child: shad.IconButton.ghost(
                  onPressed: onNavigate,
                  icon: const Icon(Icons.arrow_forward, size: 14),
                ),
              ),
            ),
          if (onRemove != null)
            Semantics(
              button: true,
              label: l10n.taskBoardDetailRemoveRelationship,
              child: Tooltip(
                message: l10n.taskBoardDetailRemoveRelationship,
                child: shad.IconButton.ghost(
                  onPressed: onRemove,
                  icon: const Icon(Icons.close, size: 14),
                ),
              ),
            ),
        ],
      ),
    );

    if (onNavigate == null) return content;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onNavigate,
        child: content,
      ),
    );
  }
}
