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
