import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/view/transaction_list_empty.dart';
import 'package:mobile/features/finance/view/transaction_list_filters.dart';
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
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final groups = groupTransactionsByDay(state.transactions);
    return NovaRefreshIndicator(
      onRefresh: onRefresh,
      child: AppPageListView.builder(
        controller: controller,
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        itemCount: groups.length + 2,
        itemBuilder: (context, index) {
          if (index == 0) {
            return TransactionListFilters(
              state: state,
              now: now,
              onChanged: onFiltersChanged,
            );
          }
          if (index == groups.length + 1) {
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
            return groups.isEmpty
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
          final group = groups[index - 1];
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FinanceDayHeader(
                group: group,
                fallbackCurrency: state.workspaceCurrency,
                now: now,
              ),
              AppGroupedCard(
                children: [
                  for (final transaction in group.transactions)
                    _row(transaction),
                ],
              ),
            ],
          );
        },
      ),
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
