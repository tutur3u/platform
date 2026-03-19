part of 'task_board_detail_page.dart';

class _TaskBoardTaskDetailRow extends StatelessWidget {
  const _TaskBoardTaskDetailRow({
    required this.label,
    this.value,
    this.child,
  });

  final String label;
  final String? value;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final resolvedChild =
        child ?? Text(value ?? '', style: theme.typography.base);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 116,
          child: Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const shad.Gap(10),
        Expanded(child: resolvedChild),
      ],
    );
  }
}

class _AssigneeChip extends StatelessWidget {
  const _AssigneeChip({
    required this.label,
    this.avatarUrl,
  });

  final String label;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final hasAvatar = avatarUrl?.trim().isNotEmpty == true;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        border: Border.all(color: shad.Theme.of(context).colorScheme.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 10,
            foregroundImage: hasAvatar ? NetworkImage(avatarUrl!.trim()) : null,
            child: hasAvatar
                ? null
                : Text(
                    label.isEmpty ? '?' : label.substring(0, 1).toUpperCase(),
                    style: const TextStyle(fontSize: 10),
                  ),
          ),
          const shad.Gap(6),
          Text(label, style: shad.Theme.of(context).typography.small),
        ],
      ),
    );
  }
}
