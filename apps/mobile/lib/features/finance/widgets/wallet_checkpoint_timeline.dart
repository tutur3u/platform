part of 'wallet_checkpoint_ui.dart';

class _TimelineList extends StatelessWidget {
  const _TimelineList({
    required this.workspaceId,
    required this.currency,
    required this.checkpoints,
    required this.showAmounts,
    required this.canMutate,
    required this.onEdit,
    required this.onDelete,
  });

  final String workspaceId;
  final String currency;

  final List<WalletCheckpoint> checkpoints;
  final bool showAmounts;
  final bool canMutate;
  final ValueChanged<WalletCheckpoint> onEdit;
  final ValueChanged<WalletCheckpoint> onDelete;

  @override
  Widget build(BuildContext context) {
    if (checkpoints.isEmpty) {
      return const SizedBox.shrink();
    }

    final theme = shad.Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FinanceSectionHeader(title: context.l10n.financeCheckpointsTimeline),
        const shad.Gap(10),
        for (final checkpoint in checkpoints)
          PendingSyncFrame(
            workspaceId: workspaceId,
            entityId: checkpoint.id,
            feature: 'finance',
            child: Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: FinancePalette.of(context).panel,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: FinancePalette.of(context).subtleBorder,
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          formatFinanceCheckpointDate(
                            context,
                            checkpoint.checkedAt,
                          ),
                          style: theme.typography.small.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const shad.Gap(4),
                        Text(
                          maskFinanceValue(
                            formatCurrency(checkpoint.actualBalance, currency),
                            showAmounts: showAmounts,
                          ),
                          style: theme.typography.textSmall.copyWith(
                            color: theme.colorScheme.mutedForeground,
                          ),
                        ),
                        if (checkpoint.note?.trim().isNotEmpty ?? false) ...[
                          const shad.Gap(4),
                          Text(
                            checkpoint.note!.trim(),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.typography.xSmall.copyWith(
                              color: theme.colorScheme.mutedForeground,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (canMutate) ...[
                    shad.GhostButton(
                      onPressed: () => onEdit(checkpoint),
                      child: const Icon(Icons.edit_outlined, size: 18),
                    ),
                    shad.GhostButton(
                      onPressed: () => onDelete(checkpoint),
                      child: const Icon(Icons.delete_outline, size: 18),
                    ),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }
}
