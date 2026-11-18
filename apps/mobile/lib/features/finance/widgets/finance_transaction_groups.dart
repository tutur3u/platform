import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_section.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/features/finance/widgets/finance_transaction_row.dart';

/// A short run of transactions grouped by day, each day a labelled card.
/// Long, paged lists build their slices lazily instead.
class FinanceTransactionGroups extends StatelessWidget {
  const FinanceTransactionGroups({
    required this.transactions,
    required this.fallbackCurrency,
    required this.onTap,
    this.showNet = false,
    this.now,
    super.key,
  });

  final List<Transaction> transactions;
  final String fallbackCurrency;
  final ValueChanged<Transaction> onTap;
  final bool showNet;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final groups = groupTransactionsByDay(transactions);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final group in groups) ...[
          FinanceDayHeader(
            group: group,
            fallbackCurrency: fallbackCurrency,
            showNet: showNet,
            now: now,
          ),
          AppGroupedCard(
            dividerInset: 64,
            children: [
              for (final transaction in group.transactions)
                FinanceTransactionRow(
                  transaction: transaction,
                  fallbackCurrency: fallbackCurrency,
                  onTap: () => onTap(transaction),
                ),
            ],
          ),
        ],
      ],
    );
  }
}
