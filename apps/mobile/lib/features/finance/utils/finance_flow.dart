import 'package:equatable/equatable.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/data/models/finance/wallet.dart';
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
  /// includes redacted amounts or lacks a conversion rate.
  final bool approximate;

  @override
  List<Object?> get props => [currency, income, expense, approximate];
}

/// The server aggregates each wallet in its own currency.
Future<FinanceFlow> loadFinanceFlow({
  required FinanceRepository repository,
  required String wsId,
  required String currency,
  required List<ExchangeRate> rates,
  required List<Wallet> wallets,
  required FinanceTransactionQuery query,
  String? walletId,
  String? search,
}) async {
  final selected = walletId == null
      ? wallets
      : wallets.where((wallet) => wallet.id == walletId);
  final target = currency.toUpperCase();
  var income = 0.0;
  var expense = 0.0;
  var approximate = false;
  for (final wallet in selected) {
    final totals = await repository.getTransactionStats(
      wsId: wsId,
      walletId: wallet.id,
      search: search,
      filters: query,
    );
    final source = (totals.currency ?? wallet.currency)?.toUpperCase();
    if (source == null || source.isEmpty) {
      approximate = true;
      continue;
    }
    final rate = convertCurrency(1, source, target, rates);
    if (rate == null) {
      approximate = true;
      continue;
    }
    income += totals.totalIncome * rate;
    expense -= totals.totalExpense.abs() * rate;
    approximate |= source != target || totals.hasRedactedAmounts;
  }
  return FinanceFlow(
    currency: target,
    income: income,
    expense: expense,
    approximate: approximate,
  );
}
