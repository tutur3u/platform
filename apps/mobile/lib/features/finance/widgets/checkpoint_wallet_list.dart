import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/finance/utils/checkpoint_wallets.dart';
import 'package:mobile/features/finance/widgets/checkpoint_amounts.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

/// Filter pills with counts and the sort chooser. Mount it at the page's
/// full width: the strip clips at the screen edge and carries the page
/// gutters inside its scroll view.
class CheckpointWalletFilters extends StatelessWidget {
  const CheckpointWalletFilters({
    required this.entries,
    required this.filter,
    required this.sort,
    required this.onFilterChanged,
    required this.onSortChanged,
    super.key,
  });

  final List<CheckpointWalletEntry> entries;
  final CheckpointWalletFilter filter;
  final CheckpointWalletSort sort;
  final ValueChanged<CheckpointWalletFilter> onFilterChanged;
  final ValueChanged<CheckpointWalletSort> onSortChanged;

  Future<void> _pickSort(BuildContext context) async {
    final picked = await showAppChoiceSheet<CheckpointWalletSort>(
      context: context,
      title: context.l10n.financeCheckpointsSort,
      selected: sort,
      choices: [
        for (final value in CheckpointWalletSort.values)
          AppSheetChoice(
            value: value,
            label: checkpointSortLabel(context, value),
          ),
      ],
    );
    if (picked != null && picked != sort) onSortChanged(picked);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    int count(CheckpointWalletFilter filter) =>
        entries.where((entry) => entry.matches(filter)).length;
    final archivedCount = count(CheckpointWalletFilter.archived);
    return LayoutBuilder(
      builder: (context, constraints) {
        final insets = AppPageInsets.of(context, width: constraints.maxWidth);
        return AppFilterBar<CheckpointWalletFilter>(
          key: const ValueKey('checkpoint-filter'),
          scrollPadding: EdgeInsets.only(
            left: insets.left,
            right: insets.right,
          ),
          leading: AppFilterButton(
            key: const ValueKey('checkpoint-sort'),
            tooltip: l10n.financeCheckpointsSort,
            label: checkpointSortLabel(context, sort),
            menu: true,
            onPressed: () => unawaited(_pickSort(context)),
          ),
          options: [
            AppFilterOption(
              value: CheckpointWalletFilter.all,
              label: l10n.financeAll,
              count: count(CheckpointWalletFilter.all),
            ),
            AppFilterOption(
              value: CheckpointWalletFilter.mismatched,
              label: l10n.financeCheckpointsMismatched,
              count: count(CheckpointWalletFilter.mismatched),
            ),
            AppFilterOption(
              value: CheckpointWalletFilter.unchecked,
              label: l10n.financeCheckpointsUnchecked,
              count: count(CheckpointWalletFilter.unchecked),
            ),
            if (archivedCount > 0 || filter == CheckpointWalletFilter.archived)
              AppFilterOption(
                value: CheckpointWalletFilter.archived,
                label: l10n.financeCheckpointsArchived,
                count: archivedCount,
              ),
          ],
          selected: filter,
          onSelected: onFilterChanged,
        );
      },
    );
  }
}

String checkpointSortLabel(BuildContext context, CheckpointWalletSort sort) =>
    switch (sort) {
      CheckpointWalletSort.name => context.l10n.financeCheckpointsSortName,
      CheckpointWalletSort.variance =>
        context.l10n.financeCheckpointsSortVariance,
      CheckpointWalletSort.lastChecked =>
        context.l10n.financeCheckpointsSortLastChecked,
    };

/// The wallets [CheckpointWalletFilters] selects, each with its
/// reconciliation state as a toned icon and variance. When [onArchive] is
/// set, rows swipe to archive, or to restore once archived.
class CheckpointWalletCard extends StatelessWidget {
  const CheckpointWalletCard({
    required this.entries,
    required this.onOpen,
    this.onArchive,
    super.key,
  });

  /// Visible wallets in display order.
  final List<CheckpointWalletEntry> entries;
  final ValueChanged<CheckpointWalletEntry> onOpen;

  /// Archives (true) or restores (false) a wallet.
  final void Function(CheckpointWalletEntry entry, bool archived)? onArchive;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return AppStateMessage.inline(
        icon: LucideIcons.listFilter,
        title: context.l10n.financeCheckpointsNoMatches,
      );
    }
    final archive = onArchive;
    return AppGroupedCard(
      children: [
        for (final entry in entries)
          _CheckpointWalletRow(
            key: ValueKey(entry.wallet.id),
            entry: entry,
            onTap: () => onOpen(entry),
            onArchive: archive == null
                ? null
                : () => archive(entry, !entry.wallet.isArchived),
          ),
      ],
    );
  }
}

class _CheckpointWalletRow extends StatelessWidget {
  const _CheckpointWalletRow({
    required this.entry,
    required this.onTap,
    this.onArchive,
    super.key,
  });

  final CheckpointWalletEntry entry;
  final VoidCallback onTap;
  final VoidCallback? onArchive;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.tokens.colorScheme;
    final wallet = entry.wallet;
    final checkpoint = entry.latest;
    final archived = wallet.isArchived;
    final status = entry.status;
    final tone = archived
        ? AppTone.neutral
        : switch (status) {
            CheckpointWalletStatus.unchecked => AppTone.neutral,
            CheckpointWalletStatus.balanced => AppTone.success,
            CheckpointWalletStatus.mismatched => checkpointVarianceTone(
              checkpoint!.currentVariance,
            ),
          };
    final row = AppRichRow(
      title: wallet.name ?? l10n.financeWallet,
      subtitle: checkpoint == null
          ? l10n.financeCheckpointsNoCheckpoint
          : l10n.financeCheckpointsCheckedOn(
              MaterialLocalizations.of(
                context,
              ).formatMediumDate(checkpoint.checkedAt.toLocal()),
            ),
      leading: AppIconTile(
        icon: archived
            ? LucideIcons.archive
            : switch (status) {
                CheckpointWalletStatus.unchecked => LucideIcons.wallet,
                CheckpointWalletStatus.balanced => LucideIcons.circleCheck,
                CheckpointWalletStatus.mismatched => LucideIcons.arrowDownUp,
              },
        tone: tone,
      ),
      trailing: switch (checkpoint) {
        _ when status == CheckpointWalletStatus.balanced => Text(
          l10n.financeCheckpointsBalanced,
          style: context.tokens.typography.small.copyWith(
            color: tone.foreground(colors),
            fontWeight: FontWeight.w600,
          ),
        ),
        final checkpoint? => FinanceAmountText(
          checkpoint.currentVariance,
          checkpoint.currency,
          signed: true,
          color: financeAmountsVisible(context)
              ? tone.foreground(colors)
              : null,
        ),
        null => null,
      },
      onTap: onTap,
    );
    final archive = onArchive;
    if (archive == null) return row;
    return AppSwipeActions(
      trailing: [
        AppSwipeAction(
          key: ValueKey('checkpoint-archive-${wallet.id}'),
          label: archived
              ? l10n.financeWalletRestore
              : l10n.financeWalletArchive,
          icon: archived ? LucideIcons.archiveRestore : LucideIcons.archive,
          tone: archived ? AppTone.primary : AppTone.warning,
          onPressed: archive,
        ),
      ],
      child: row,
    );
  }
}
