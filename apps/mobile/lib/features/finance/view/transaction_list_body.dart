import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/features/finance/view/transaction_custom_range_sheet.dart';
import 'package:mobile/features/finance/view/transaction_list_empty.dart';
import 'package:mobile/features/finance/view/transaction_list_filters.dart';
import 'package:mobile/features/finance/widgets/finance_period_bar.dart';
import 'package:mobile/features/finance/widgets/finance_transaction_row.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

class TransactionListBody extends StatelessWidget {
  const TransactionListBody({
    required this.state,
    required this.controller,
    required this.onRefresh,
    required this.onTransactionTap,
    required this.onFiltersChanged,
    required this.onClearFilters,
    required this.onCreate,
    this.onClearSearch,
    this.onLoadMore,
    this.workspaceId,
    this.showTagFilter = false,
    this.showCreatorFilter = false,
    this.now,
    super.key,
  });

  final TransactionListState state;
  final ScrollController controller;
  final Future<void> Function() onRefresh;
  final ValueChanged<Transaction> onTransactionTap;
  final TransactionFiltersChanged onFiltersChanged;
  final VoidCallback onClearFilters;

  /// Clears the query; defaults to [onClearFilters].
  final VoidCallback? onClearSearch;
  final VoidCallback? onCreate;
  final VoidCallback? onLoadMore;
  final String? workspaceId;
  final bool showTagFilter;
  final bool showCreatorFilter;
  final DateTime? now;

  Future<void> _pickDateRange(BuildContext context, DateTime today) async {
    final selection = await showTransactionDateRange(
      context,
      state.query,
      today,
    );
    if (!context.mounted || selection == null) return;
    onFiltersChanged(
      state.query.withDateRange(selection.start, selection.end),
      state.walletId,
    );
  }

  @override
  Widget build(BuildContext context) {
    final groups = groupTransactionsByDay(state.transactions);
    final today = now ?? DateTime.now();
    final query = state.query;
    final start = query.start;
    final end = query.inclusiveEnd;
    final dates = MaterialLocalizations.of(context);
    final customLabel = query.isCustomDateRange && start != null && end != null
        ? '${dates.formatCompactDate(start)} – ${dates.formatCompactDate(end)}'
        : null;
    return NovaRefreshIndicator(
      onRefresh: onRefresh,
      child: CustomScrollView(
        controller: controller,
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        slivers: [
          SliverAppPage(
            includeBottom: false,
            sliver: SliverPersistentHeader(
              pinned: true,
              delegate: FinancePinnedHeaderDelegate(
                extent: financePeriodBarExtent(context),
                child: FinancePeriodBar(
                  key: const ValueKey('finance-transactions-period'),
                  period: customLabel == null ? financePeriodOf(query) : null,
                  customLabel: customLabel,
                  kinds: financeAllPeriodKinds,
                  onCustomRange: () => _pickDateRange(context, today),
                  now: today,
                  onChanged: (period) => onFiltersChanged(
                    query.copyWith(
                      start: period.start,
                      end: period.end,
                      isCustomDateRange: false,
                    ),
                    state.walletId,
                  ),
                  onAllTime: () => onFiltersChanged(
                    query.copyWith(
                      start: null,
                      end: null,
                      isCustomDateRange: false,
                    ),
                    state.walletId,
                  ),
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: TransactionListFilters(
              state: state,
              onChanged: onFiltersChanged,
              showTagFilter: showTagFilter,
              showCreatorFilter: showCreatorFilter,
            ),
          ),
          SliverAppPage(
            includeTop: false,
            sliver: SliverList.builder(
              itemCount: groups.length + 1,
              itemBuilder: (context, index) => index == groups.length
                  ? _footer(context, groups.isEmpty)
                  : _group(groups[index]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _footer(BuildContext context, bool empty) {
    final l10n = context.l10n;
    if (state.status == TransactionListStatus.loading ||
        state.status == TransactionListStatus.initial) {
      return const Padding(
        padding: EdgeInsets.only(top: AppSpacing.lg),
        child: AppSkeletonRows(count: 3),
      );
    }
    if (state.status == TransactionListStatus.error) {
      return Padding(
        padding: const EdgeInsets.only(top: AppSpacing.lg),
        child: AppStateMessage(
          icon: Icons.error_outline,
          title: l10n.commonSomethingWentWrong,
          message: state.error,
          actionLabel: l10n.commonRetry,
          onAction: onRefresh,
        ),
      );
    }
    if (state.hasMore && onLoadMore != null) {
      return Center(
        child: TextButton(
          onPressed: onLoadMore,
          child: Text(l10n.commonLoadMore),
        ),
      );
    }
    return empty
        ? Padding(
            padding: const EdgeInsets.only(top: AppSpacing.lg),
            child: TransactionListEmptyState(
              state: state,
              onCreate: onCreate,
              onClearFilters: onClearFilters,
              onClearSearch: onClearSearch ?? onClearFilters,
            ),
          )
        : const SizedBox.shrink();
  }

  Widget _group(FinanceDayGroup group) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FinanceDayHeader(
          group: group,
          fallbackCurrency: state.workspaceCurrency,
          now: now,
        ),
        AppGroupedCard(
          dividerInset: 64,
          children: [
            for (final transaction in group.transactions) _row(transaction),
          ],
        ),
      ],
    );
  }

  Widget _row(Transaction transaction) {
    final row = FinanceTransactionRow(
      transaction: transaction,
      fallbackCurrency: state.workspaceCurrency,
      exchangeRates: state.exchangeRates,
      onTap: () => onTransactionTap(transaction),
    );
    final scope = workspaceId;
    return scope == null
        ? row
        : PendingSyncFrame(
            workspaceId: scope,
            entityId: transaction.id,
            feature: 'finance',
            child: row,
          );
  }
}
