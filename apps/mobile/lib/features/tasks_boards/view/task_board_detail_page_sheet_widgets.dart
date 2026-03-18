part of 'task_board_detail_page.dart';

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
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [Text(label), Text(buttonLabel)],
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
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Flexible(
            child: Text(
              value,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
            ),
          ),
        ],
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
