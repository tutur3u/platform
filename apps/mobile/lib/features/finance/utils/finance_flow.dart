import 'package:equatable/equatable.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/data/repositories/finance_repository.dart';

/// Money in and out over a period, in one [currency].
class FinanceFlow extends Equatable {
  const FinanceFlow({
    required this.currency,
    this.income = 0,
    this.expense = 0,
    this.approximate = false,
  });

  final String currency;
  final double income;

  /// Negative or zero.
  final double expense;

  /// True when amounts were converted from other currencies or the period
  /// had more transactions than one read covers.
  final bool approximate;

  @override
  List<Object?> get props => [currency, income, expense, approximate];
}

/// Pages read per period before the totals are marked approximate.
const financeFlowMaxPages = 10;
const _pageSize = 100;

/// Sums income and expense of [transactions] into [currency]. Transfers and
/// transactions excluded from reports are left out; other currencies are
/// converted with [rates] and skipped when no rate exists, so amounts in
/// different currencies are never added as if they were the same.
FinanceFlow summarizeFinanceFlow(
  Iterable<Transaction> transactions, {
  required String currency,
  required List<ExchangeRate> rates,
  bool truncated = false,
}) {
  var income = 0.0;
  var expense = 0.0;
  var approximate = truncated;
  final target = currency.toUpperCase();
  for (final transaction in transactions) {
    final amount = transaction.amount;
    if (amount == null ||
        transaction.isTransfer ||
        transaction.reportOptIn == false) {
      continue;
    }
    final source = (transaction.walletCurrency ?? target).toUpperCase();
    double? value = amount;
    if (source != target) {
      value = convertCurrency(amount, source, target, rates);
      approximate = true;
      if (value == null) continue;
    }
    if (value > 0) {
      income += value;
    } else {
      expense += value;
    }
  }
  return FinanceFlow(
    currency: target,
    income: income,
    expense: expense,
    approximate: approximate,
  );
}

/// Reads the transactions matching [query] (optionally one wallet) and
/// returns their [summarizeFinanceFlow] totals.
Future<FinanceFlow> loadFinanceFlow({
  required FinanceRepository repository,
  required String wsId,
  required String currency,
  required List<ExchangeRate> rates,
  required FinanceTransactionQuery query,
  String? walletId,
  String? search,
}) async {
  final rows = <Transaction>[];
  String? cursor;
  var hasMore = true;
  var pages = 0;
  while (hasMore && pages < financeFlowMaxPages) {
    final page = await repository.getTransactionsInfinite(
      wsId: wsId,
      limit: _pageSize,
      cursor: cursor,
      walletId: walletId,
      search: search,
      query: query,
    );
    rows.addAll(page.data);
    pages++;
    cursor = page.nextCursor;
    hasMore = page.hasMore && cursor != null;
  }
  return summarizeFinanceFlow(
    rows,
    currency: currency,
    rates: rates,
    truncated: hasMore,
  );
}
