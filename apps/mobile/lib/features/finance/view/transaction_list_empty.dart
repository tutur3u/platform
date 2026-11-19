import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Why the transaction list is empty.
enum TransactionEmptyKind {
  /// Nothing recorded in the selected period (or at all).
  none,

  /// Kind, category, tag or wallet filters hide every row of the period.
  filtered,

  /// A search query matches nothing.
  search,
}

/// The period alone never counts as a filter: it is the view itself.
TransactionEmptyKind transactionEmptyKindOf(TransactionListState state) {
  if (state.search.trim().isNotEmpty) return TransactionEmptyKind.search;
  final query = state.query;
  if (query.kind != FinanceTransactionKind.all ||
      query.categoryId != null ||
      query.tagId != null ||
      state.walletId != null) {
    return TransactionEmptyKind.filtered;
  }
  return TransactionEmptyKind.none;
}

/// Empty list copy and its one action, matching what hides the rows:
/// create for an empty period, Clear filters for filters, Clear search for
/// a query.
class TransactionListEmptyState extends StatelessWidget {
  const TransactionListEmptyState({
    required this.state,
    required this.onCreate,
    required this.onClearFilters,
    required this.onClearSearch,
    super.key,
  });

  final TransactionListState state;
  final VoidCallback? onCreate;
  final VoidCallback onClearFilters;
  final VoidCallback onClearSearch;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final kind = transactionEmptyKindOf(state);
    final start = state.query.start;
    final locale = Localizations.localeOf(context).toString();
    return switch (kind) {
      TransactionEmptyKind.search => AppStateMessage(
        key: const ValueKey('finance-transactions-empty-search'),
        icon: LucideIcons.searchX,
        illustration: const AppIllustration(
          AppIllustrationKind.searchNoResults,
        ),
        title: l10n.financeSearchNoResults(state.search.trim()),
        message: l10n.financeActivitySearchEmptyBody,
        actionLabel: l10n.financeActivityClearSearch,
        onAction: onClearSearch,
      ),
      TransactionEmptyKind.filtered => AppStateMessage(
        key: const ValueKey('finance-transactions-empty-filtered'),
        icon: LucideIcons.listFilter,
        illustration: const AppIllustration(
          AppIllustrationKind.searchNoResults,
        ),
        title: l10n.financeNoSearchResults,
        message: l10n.financeFiltersHideResults,
        actionLabel: l10n.financeClearFilters,
        onAction: onClearFilters,
      ),
      TransactionEmptyKind.none => AppStateMessage(
        key: const ValueKey('finance-transactions-empty-none'),
        icon: LucideIcons.receipt,
        illustration: const AppIllustration(AppIllustrationKind.noTransactions),
        title: start == null
            ? l10n.financeNoTransactions
            : l10n.financeNoTransactionsInPeriod(
                DateFormat.yMMMM(locale).format(start),
              ),
        message: l10n.financeOverviewNoTransactionsBody,
        actionLabel: onCreate == null ? null : l10n.financeAddFirstTransaction,
        onAction: onCreate,
      ),
    };
  }
}
