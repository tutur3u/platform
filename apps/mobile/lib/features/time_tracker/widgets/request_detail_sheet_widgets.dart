part of 'request_detail_sheet.dart';

class _ExpandableSection extends StatelessWidget {
  const _ExpandableSection({
    required this.title,
    required this.isExpanded,
    required this.onToggle,
    required this.child,
    this.count,
  });

  final String title;
  final bool isExpanded;
  final VoidCallback onToggle;
  final Widget child;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Column(
      children: [
        InkWell(
          onTap: onToggle,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              border: Border.all(color: theme.colorScheme.border),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Text(title, style: theme.typography.semiBold),
                if (count != null) ...[
                  const shad.Gap(8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.muted,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text('$count', style: theme.typography.small),
                  ),
                ],
                const Spacer(),
                Icon(
                  isExpanded ? Icons.expand_less : Icons.expand_more,
                  color: theme.colorScheme.mutedForeground,
                ),
              ],
            ),
          ),
        ),
        if (isExpanded) ...[const shad.Gap(16), child],
      ],
    );
  }
}
