part of 'task_board_detail_page.dart';

class _SortBottomSheet extends StatelessWidget {
  const _SortBottomSheet({
    required this.currentField,
    required this.ascending,
    required this.onSortSelected,
  });

  final String currentField;
  final bool ascending;
  final void Function(String field, {required bool ascending}) onSortSelected;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 4,
            margin: const EdgeInsets.only(top: 12, bottom: 16),
            decoration: BoxDecoration(
              color: theme.colorScheme.mutedForeground.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Text(
                  context.l10n.sortBy,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const shad.Divider(),
          _SortOption(
            label: context.l10n.taskBoardDetailTaskTitleLabel,
            field: 'name',
            currentField: currentField,
            ascending: ascending,
            onTap: onSortSelected,
          ),
          _SortOption(
            label: context.l10n.taskBoardDetailPriority,
            field: 'priority',
            currentField: currentField,
            ascending: ascending,
            onTap: onSortSelected,
          ),
          _SortOption(
            label: context.l10n.taskBoardDetailTaskEndDate,
            field: 'end_date',
            currentField: currentField,
            ascending: ascending,
            onTap: onSortSelected,
          ),
          _SortOption(
            label: context.l10n.taskBoardDetailTaskAssignees,
            field: 'assignees',
            currentField: currentField,
            ascending: ascending,
            onTap: onSortSelected,
          ),
          _SortOption(
            label: context.l10n.taskBoardsCreatedAt,
            field: 'created_at',
            currentField: currentField,
            ascending: ascending,
            onTap: onSortSelected,
          ),
          const shad.Gap(16),
        ],
      ),
    );
  }
}

class _SortOption extends StatelessWidget {
  const _SortOption({
    required this.label,
    required this.field,
    required this.currentField,
    required this.ascending,
    required this.onTap,
  });

  final String label;
  final String field;
  final String currentField;
  final bool ascending;
  final void Function(String field, {required bool ascending}) onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isSelected = currentField == field;

    return InkWell(
      onTap: () => onTap(field, ascending: !(isSelected && ascending)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: theme.typography.p.copyWith(
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                  color: isSelected
                      ? theme.colorScheme.primary
                      : theme.colorScheme.foreground,
                ),
              ),
            ),
            if (isSelected)
              Icon(
                ascending ? Icons.arrow_upward : Icons.arrow_downward,
                size: 18,
                color: theme.colorScheme.primary,
              ),
          ],
        ),
      ),
    );
  }
}
