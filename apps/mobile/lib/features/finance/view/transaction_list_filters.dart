import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_filter_bar.dart';
import 'package:mobile/core/ui/overlays/app_action_sheet.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/view/finance_overview_month.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/l10n/l10n.dart';

/// Months the month picker offers, newest first.
const transactionMonthChoices = 12;

typedef TransactionFiltersChanged =
    void Function(FinanceTransactionQuery query, String? walletId);

/// Kind pills, month, wallet and category pickers, and the In/Out totals of
/// whatever the filters select.
class TransactionListFilters extends StatelessWidget {
  const TransactionListFilters({
    required this.state,
    required this.onChanged,
    this.now,
    super.key,
  });

  final TransactionListState state;
  final TransactionFiltersChanged onChanged;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final query = state.query;
    final locale = Localizations.localeOf(context).toString();
    final start = query.start;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppFilterBar<FinanceTransactionKind>(
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
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          child: Row(
            spacing: AppSpacing.sm,
            children: [
              AppFilterButton(
                key: const ValueKey('finance-filter-month'),
                icon: LucideIcons.calendar,
                label: start == null
                    ? l10n.financeAllTime
                    : DateFormat.yMMM(locale).format(start),
                active: start != null,
                onPressed: () => unawaited(_pickMonth(context)),
              ),
              AppFilterButton(
                key: const ValueKey('finance-filter-wallet'),
                icon: LucideIcons.wallet,
                label: state.selectedWallet?.name ?? l10n.financeAllWallets,
                active: state.walletId != null,
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
                onPressed: () => unawaited(_pickCategory(context)),
              ),
            ],
          ),
        ),
        if (start != null && query.kind != FinanceTransactionKind.transfer) ...[
          const SizedBox(height: AppSpacing.md),
          _FlowRow(state: state),
        ],
      ],
    );
  }

  Future<void> _pickMonth(BuildContext context) async {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final today = now ?? DateTime.now();
    final months = [
      for (var i = 0; i < transactionMonthChoices; i++)
        DateTime(today.year, today.month - i),
    ];
    final current = state.query.start;
    final picked = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.financeMonth,
      selected: current == null ? '' : current.toIso8601String(),
      choices: [
        for (final month in months)
          AppSheetChoice(
            value: month.toIso8601String(),
            label: DateFormat.yMMMM(locale).format(month),
          ),
        AppSheetChoice(value: '', label: l10n.financeAllTime),
      ],
    );
    if (!context.mounted || picked == null) return;
    final month = picked.isEmpty ? null : DateTime.parse(picked);
    onChanged(
      month == null
          ? state.query.copyWith(start: null, end: null)
          : FinanceTransactionQuery.month(
              month,
              kind: state.query.kind,
              categoryId: state.query.categoryId,
            ),
      state.walletId,
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
