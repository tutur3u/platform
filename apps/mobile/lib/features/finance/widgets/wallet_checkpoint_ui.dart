import 'package:flutter/material.dart' hide Card;
import 'package:intl/intl.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

String formatFinanceCheckpointDate(BuildContext context, DateTime value) {
  final locale = Localizations.localeOf(context).toLanguageTag();
  return DateFormat.yMMMd(locale).add_Hm().format(value.toLocal());
}

class FinanceCheckpointTotalsPanel extends StatelessWidget {
  const FinanceCheckpointTotalsPanel({
    required this.totals,
    required this.showAmounts,
    required this.onBatchCheck,
    super.key,
  });

  final List<WalletCheckpointCurrencyTotal> totals;
  final bool showAmounts;
  final VoidCallback onBatchCheck;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);

    return FinancePanel(
      backgroundColor: palette.elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: palette.accent.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(
                  Icons.fact_check_outlined,
                  color: palette.accent,
                  size: 24,
                ),
              ),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.l10n.financeCheckpointsTitle,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const shad.Gap(4),
                    Text(
                      context.l10n.financeCheckpointsDescription,
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const shad.Gap(18),
          if (totals.isEmpty)
            Text(
              context.l10n.financeCheckpointsNoCheckpointDetail,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            )
          else
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (final total in totals)
                  _CheckpointTotalChip(total: total, showAmounts: showAmounts),
              ],
            ),
          const shad.Gap(18),
          shad.PrimaryButton(
            onPressed: onBatchCheck,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.add_task_outlined, size: 16),
                const shad.Gap(8),
                Text(context.l10n.financeCheckpointsBatchRecord),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class WalletCheckpointSelector extends StatelessWidget {
  const WalletCheckpointSelector({
    required this.wallets,
    required this.selectedWalletId,
    required this.latestByWalletId,
    required this.onSelected,
    super.key,
  });

  final List<Wallet> wallets;
  final String? selectedWalletId;
  final Map<String, WalletCheckpoint> latestByWalletId;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FinanceSectionHeader(
          title: context.l10n.financeCheckpointsWalletsTitle,
          subtitle: context.l10n.financeCheckpointsWalletsSubtitle,
        ),
        const shad.Gap(12),
        SizedBox(
          height: 92,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: wallets.length,
            separatorBuilder: (_, _) => const shad.Gap(10),
            itemBuilder: (context, index) {
              final wallet = wallets[index];
              final selected = wallet.id == selectedWalletId;
              final latest = latestByWalletId[wallet.id];
              return Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () => onSelected(wallet.id),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    width: 216,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: selected
                          ? palette.accent.withValues(alpha: 0.13)
                          : palette.panel,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: selected ? palette.accent : palette.subtleBorder,
                      ),
                    ),
                    child: Row(
                      children: [
                        WalletVisualAvatar(
                          icon: wallet.icon,
                          imageSrc: wallet.imageSrc,
                          fallbackIcon: Icons.account_balance_wallet_outlined,
                          size: 42,
                        ),
                        const shad.Gap(10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                wallet.name ?? '-',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.typography.small.copyWith(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const shad.Gap(4),
                              Text(
                                latest == null
                                    ? context
                                          .l10n
                                          .financeCheckpointsNoCheckpointShort
                                    : formatFinanceCheckpointDate(
                                        context,
                                        latest.checkedAt,
                                      ),
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
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class WalletCheckpointDetailSections extends StatelessWidget {
  const WalletCheckpointDetailSections({
    required this.wallet,
    required this.response,
    required this.showAmounts,
    required this.canMutate,
    required this.onCreate,
    required this.onEdit,
    required this.onDelete,
    required this.onReconcile,
    super.key,
  });

  final Wallet wallet;
  final WalletCheckpointListResponse response;
  final bool showAmounts;
  final bool canMutate;
  final VoidCallback onCreate;
  final ValueChanged<WalletCheckpoint> onEdit;
  final ValueChanged<WalletCheckpoint> onDelete;
  final ValueChanged<WalletCheckpointInterval> onReconcile;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _LatestCheckpointCard(
          wallet: wallet,
          checkpoint: response.latest,
          showAmounts: showAmounts,
          onCreate: onCreate,
        ),
        const shad.Gap(16),
        _IntervalList(
          intervals: response.intervals,
          currency: wallet.currency ?? response.latest?.currency ?? 'USD',
          showAmounts: showAmounts,
          onReconcile: canMutate ? onReconcile : null,
        ),
        const shad.Gap(16),
        _TimelineList(
          checkpoints: response.data,
          showAmounts: showAmounts,
          canMutate: canMutate,
          onEdit: onEdit,
          onDelete: onDelete,
        ),
      ],
    );
  }
}

class _CheckpointTotalChip extends StatelessWidget {
  const _CheckpointTotalChip({required this.total, required this.showAmounts});

  final WalletCheckpointCurrencyTotal total;
  final bool showAmounts;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final varianceColor = total.varianceTotal == 0
        ? palette.positive
        : palette.negative;

    return Container(
      width: 220,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: varianceColor.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: varianceColor.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            total.currency,
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w800,
              color: varianceColor,
            ),
          ),
          const shad.Gap(8),
          Text(
            maskFinanceValue(
              formatCurrency(total.actualTotal, total.currency),
              showAmounts: showAmounts,
            ),
            style: theme.typography.large.copyWith(fontWeight: FontWeight.w900),
          ),
          const shad.Gap(4),
          Text(
            context.l10n.financeCheckpointsVarianceValue(
              maskFinanceValue(
                formatCurrency(total.varianceTotal, total.currency),
                showAmounts: showAmounts,
              ),
            ),
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

class _LatestCheckpointCard extends StatelessWidget {
  const _LatestCheckpointCard({
    required this.wallet,
    required this.checkpoint,
    required this.showAmounts,
    required this.onCreate,
  });

  final Wallet wallet;
  final WalletCheckpoint? checkpoint;
  final bool showAmounts;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final current = checkpoint;

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  context.l10n.financeCheckpointsLatest,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              shad.OutlineButton(
                onPressed: onCreate,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.add, size: 16),
                    const shad.Gap(6),
                    Text(context.l10n.financeCheckpointsRecord),
                  ],
                ),
              ),
            ],
          ),
          const shad.Gap(14),
          if (current == null)
            Text(
              context.l10n.financeCheckpointsNoCheckpointDetail,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            )
          else ...[
            Text(
              formatFinanceCheckpointDate(context, current.checkedAt),
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
            const shad.Gap(12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FinanceStatChip(
                  icon: Icons.account_balance_wallet_outlined,
                  label: context.l10n.financeCheckpointsActualBalance,
                  value: maskFinanceValue(
                    formatCurrency(current.actualBalance, current.currency),
                    showAmounts: showAmounts,
                  ),
                  tint: palette.accent,
                ),
                FinanceStatChip(
                  icon: Icons.receipt_long_outlined,
                  label: context.l10n.financeCheckpointsLedgerBalance,
                  value: maskFinanceValue(
                    formatCurrency(current.ledgerBalance, current.currency),
                    showAmounts: showAmounts,
                  ),
                  tint: theme.colorScheme.mutedForeground,
                ),
                FinanceStatChip(
                  icon: current.currentVariance == 0
                      ? Icons.check_circle_outline
                      : Icons.warning_amber_rounded,
                  label: context.l10n.financeCheckpointsCurrentVariance,
                  value: maskFinanceValue(
                    formatCurrency(current.currentVariance, current.currency),
                    showAmounts: showAmounts,
                  ),
                  tint: current.currentVariance == 0
                      ? palette.positive
                      : palette.negative,
                ),
              ],
            ),
            if (current.note?.trim().isNotEmpty ?? false) ...[
              const shad.Gap(12),
              Text(
                current.note!.trim(),
                style: theme.typography.textSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _IntervalList extends StatelessWidget {
  const _IntervalList({
    required this.intervals,
    required this.currency,
    required this.showAmounts,
    required this.onReconcile,
  });

  final List<WalletCheckpointInterval> intervals;
  final String currency;
  final bool showAmounts;
  final ValueChanged<WalletCheckpointInterval>? onReconcile;

  @override
  Widget build(BuildContext context) {
    if (intervals.isEmpty) {
      return const SizedBox.shrink();
    }

    final theme = shad.Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FinanceSectionHeader(
          title: context.l10n.financeCheckpointsWindows,
          subtitle: context.l10n.financeCheckpointsWindowsSubtitle,
        ),
        const shad.Gap(10),
        for (final interval in intervals) ...[
          _IntervalTile(
            interval: interval,
            currency: currency,
            showAmounts: showAmounts,
            onReconcile: onReconcile,
          ),
          const shad.Gap(10),
        ],
        Text(
          context.l10n.financeCheckpointsTransactionCountHint,
          style: theme.typography.xSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }
}

class _IntervalTile extends StatelessWidget {
  const _IntervalTile({
    required this.interval,
    required this.currency,
    required this.showAmounts,
    required this.onReconcile,
  });

  final WalletCheckpointInterval interval;
  final String currency;
  final bool showAmounts;
  final ValueChanged<WalletCheckpointInterval>? onReconcile;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final tint = interval.isClean ? palette.positive : palette.negative;
    final startLabel = formatFinanceCheckpointDate(
      context,
      interval.startCheckedAt,
    );
    final endLabel = formatFinanceCheckpointDate(
      context,
      interval.endCheckedAt,
    );

    return FinancePanel(
      padding: const EdgeInsets.all(14),
      borderColor: tint.withValues(alpha: 0.30),
      backgroundColor: tint.withValues(alpha: 0.08),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                interval.isClean
                    ? Icons.check_circle_outline
                    : Icons.warning_amber_rounded,
                color: tint,
                size: 18,
              ),
              const shad.Gap(8),
              Expanded(
                child: Text(
                  '$startLabel - $endLabel',
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const shad.Gap(10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FinanceStatChip(
                label: context.l10n.financeCheckpointsActualDelta,
                value: maskFinanceValue(
                  formatCurrency(interval.actualDelta, currency),
                  showAmounts: showAmounts,
                ),
                tint: palette.accent,
              ),
              FinanceStatChip(
                label: context.l10n.financeCheckpointsLedgerDelta,
                value: maskFinanceValue(
                  formatCurrency(interval.ledgerDelta, currency),
                  showAmounts: showAmounts,
                ),
              ),
              FinanceStatChip(
                label: context.l10n.financeCheckpointsVariance,
                value: maskFinanceValue(
                  formatCurrency(interval.intervalVariance, currency),
                  showAmounts: showAmounts,
                ),
                tint: tint,
              ),
            ],
          ),
          if (!interval.isClean && onReconcile != null) ...[
            const shad.Gap(12),
            shad.PrimaryButton(
              onPressed: () => onReconcile!(interval),
              child: Text(context.l10n.financeCheckpointsReconcile),
            ),
          ],
        ],
      ),
    );
  }
}

class _TimelineList extends StatelessWidget {
  const _TimelineList({
    required this.checkpoints,
    required this.showAmounts,
    required this.canMutate,
    required this.onEdit,
    required this.onDelete,
  });

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
          Container(
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
                          formatCurrency(
                            checkpoint.actualBalance,
                            checkpoint.currency,
                          ),
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
      ],
    );
  }
}
