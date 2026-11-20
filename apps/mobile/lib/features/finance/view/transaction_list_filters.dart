import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_filter_bar.dart';
import 'package:mobile/core/ui/overlays/app_action_sheet.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/view/finance_overview_month.dart';
import 'package:mobile/features/finance/view/transaction_creator_picker.dart';
import 'package:mobile/features/finance/view/transaction_tag_picker.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/l10n/l10n.dart';

typedef TransactionFiltersChanged =
    void Function(FinanceTransactionQuery query, String? walletId);

/// Kind pills, wallet and category chips, and the In/Out totals of whatever
/// the filters select. The period has its own pinned bar.
class TransactionListFilters extends StatelessWidget {
  const TransactionListFilters({
    required this.state,
    required this.onChanged,
    this.showTagFilter = false,
    this.showCreatorFilter = false,
    super.key,
  });

  final TransactionListState state;
  final TransactionFiltersChanged onChanged;
  final bool showTagFilter;
  final bool showCreatorFilter;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final query = state.query;
    final start = query.start;
    return LayoutBuilder(
      builder: (context, constraints) {
        final insets = AppPageInsets.of(context, width: constraints.maxWidth);
        final gutter = EdgeInsets.only(left: insets.left, right: insets.right);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppFilterBar<FinanceTransactionKind>(
              scrollPadding: gutter,
              options: [
                AppFilterOption(
                  value: FinanceTransactionKind.all,
                  label: l10n.financeAll,
                ),
                AppFilterOption(
                  value: FinanceTransactionKind.income,
                  label: l10n.financeIncome,
                ),
                AppFilterOption(
                  value: FinanceTransactionKind.expense,
                  label: l10n.financeExpense,
                ),
                AppFilterOption(
                  value: FinanceTransactionKind.transfer,
                  label: l10n.financeTransfers,
                ),
              ],
              selected: query.kind,
              onSelected: (kind) =>
                  onChanged(query.copyWith(kind: kind), state.walletId),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppHorizontalScrollView(
              padding: gutter,
              child: Row(
                spacing: AppSpacing.sm,
                children: [
                  AppFilterButton(
                    key: const ValueKey('finance-filter-wallet'),
                    icon: LucideIcons.wallet,
                    label: state.selectedWallet?.name ?? l10n.financeAllWallets,
                    active: state.walletId != null,
                    menu: true,
                    onPressed: () => unawaited(_pickWallet(context)),
                  ),
                  AppFilterButton(
                    key: const ValueKey('finance-filter-category'),
                    icon: LucideIcons.tag,
                    label:
                        state.categories
                            .where((c) => c.id == query.categoryId)
                            .firstOrNull
                            ?.name ??
                        l10n.financeCategory,
                    active: query.categoryId != null,
                    menu: true,
                    onPressed: () => unawaited(_pickCategory(context)),
                  ),
                  if (showTagFilter)
                    AppFilterButton(
                      key: const ValueKey('finance-filter-tag'),
                      icon: LucideIcons.tags,
                      label: l10n.financeTags,
                      active: query.tagId != null,
                      menu: true,
                      onPressed: () => unawaited(_pickTag(context)),
                    ),
                  if (showCreatorFilter)
                    AppFilterButton(
                      key: const ValueKey('finance-filter-creator'),
                      icon: LucideIcons.userRound,
                      label: l10n.financeCreator,
                      active: query.creatorId != null,
                      menu: true,
                      onPressed: () => unawaited(_pickCreator(context)),
                    ),
                ],
              ),
            ),
            if (start != null &&
                query.kind != FinanceTransactionKind.transfer) ...[
              const SizedBox(height: AppSpacing.md),
              Padding(
                padding: gutter,
                child: _FlowRow(state: state),
              ),
            ],
          ],
        );
      },
    );
  }

  Future<void> _pickWallet(BuildContext context) async {
    final l10n = context.l10n;
    final picked = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.financeWallet,
      selected: state.walletId ?? '',
      choices: [
        AppSheetChoice(value: '', label: l10n.financeAllWallets),
        for (final wallet in state.wallets)
          AppSheetChoice(value: wallet.id, label: wallet.name ?? wallet.id),
      ],
    );
    if (!context.mounted || picked == null) return;
    onChanged(state.query, picked.isEmpty ? null : picked);
  }

  Future<void> _pickTag(BuildContext context) async {
    final picked = await showTransactionTagPicker(context, state.query.tagId);
    if (!context.mounted || picked == null) return;
    onChanged(
      state.query.copyWith(tagId: picked.isEmpty ? null : picked),
      state.walletId,
    );
  }

  Future<void> _pickCreator(BuildContext context) async {
    final picked = await showTransactionCreatorPicker(
      context,
      state.query.creatorId,
    );
    if (!context.mounted || picked == null) return;
    onChanged(
      state.query.copyWith(creatorId: picked.isEmpty ? null : picked),
      state.walletId,
    );
  }

  Future<void> _pickCategory(BuildContext context) async {
    final l10n = context.l10n;
    final picked = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.financeCategory,
      selected: state.query.categoryId ?? '',
      choices: [
        AppSheetChoice(value: '', label: l10n.financeAllCategories),
        for (final category in state.categories)
          AppSheetChoice(
            value: category.id,
            label: category.name ?? category.id,
          ),
      ],
    );
    if (!context.mounted || picked == null) return;
    onChanged(
      state.query.copyWith(categoryId: picked.isEmpty ? null : picked),
      state.walletId,
    );
  }
}

class _FlowRow extends StatelessWidget {
  const _FlowRow({required this.state});

  final TransactionListState state;

  @override
  Widget build(BuildContext context) {
    final flow = state.flow;
    if (flow == null) {
      return state.status == TransactionListStatus.loading ||
              state.status == TransactionListStatus.initial
          ? const FinanceSkeleton(height: 92)
          : const SizedBox.shrink();
    }
    final l10n = context.l10n;
    final kind = state.query.kind;
    return IntrinsicHeight(
      child: Row(
        spacing: 10,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (kind != FinanceTransactionKind.expense)
            Expanded(
              child: FinanceFlowTile(
                key: const ValueKey('finance-flow-in'),
                label: l10n.financeIn,
                icon: LucideIcons.arrowDownLeft,
                hue: 'green',
                amount: flow.income,
                currency: flow.currency,
                approximate: flow.approximate,
              ),
            ),
          if (kind != FinanceTransactionKind.income)
            Expanded(
              child: FinanceFlowTile(
                key: const ValueKey('finance-flow-out'),
                label: l10n.financeOut,
                icon: LucideIcons.arrowUpRight,
                hue: 'red',
                amount: flow.expense,
                currency: flow.currency,
                approximate: flow.approximate,
              ),
            ),
        ],
      ),
    );
  }
}
