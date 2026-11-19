import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';

typedef FinanceReportCategory = ({String? name, double amount});

class FinanceWalletReport {
  FinanceWalletReport(FinancePeriod period, Iterable<Transaction> transactions)
    : this._(period, transactions.where((row) => _included(period, row)));

  factory FinanceWalletReport.workspace(
    FinancePeriod period,
    Iterable<Transaction> transactions, {
    required Map<String, String?> currencies,
    required String targetCurrency,
    required List<ExchangeRate> rates,
  }) {
    var converted = false;
    final rows = <Transaction>[];
    for (final row in transactions) {
      if (!_included(period, row) || !currencies.containsKey(row.walletId)) {
        continue;
      }
      final source = row.walletCurrency ?? currencies[row.walletId];
      if (source == null || source.isEmpty) {
        throw const FinanceReportRateMissing();
      }
      final amount = convertCurrency(
        row.amount!,
        source,
        targetCurrency,
        rates,
      );
      if (amount == null) throw const FinanceReportRateMissing();
      converted |= source.toUpperCase() != targetCurrency.toUpperCase();
      rows.add(row.copyWith(amount: amount));
    }
    return FinanceWalletReport._(period, rows, converted: converted);
  }

  FinanceWalletReport._(
    FinancePeriod period,
    Iterable<Transaction> rows, {
    this.converted = false,
  }) : buckets = financePeriodBuckets(period, rows),
       incomeCategories = _categories(rows, income: true),
       expenseCategories = _categories(rows, income: false),
       hasRows = rows.isNotEmpty;

  static bool _included(FinancePeriod period, Transaction row) {
    final date = (row.takenAt ?? row.createdAt)?.toLocal();
    return date != null &&
        period.contains(date) &&
        row.reportOptIn != false &&
        !row.isTransfer &&
        row.amount != null;
  }

  final ({List<double> income, List<double> expense}) buckets;
  final List<FinanceReportCategory> incomeCategories;
  final List<FinanceReportCategory> expenseCategories;
  final bool hasRows;
  final bool converted;

  double get income => buckets.income.fold(0, (sum, value) => sum + value);
  double get expense => buckets.expense.fold(0, (sum, value) => sum + value);

  List<double> get movement {
    var balance = 0.0;
    return [
      for (var i = 0; i < buckets.income.length; i++)
        balance += buckets.income[i] - buckets.expense[i],
    ];
  }

  static List<FinanceReportCategory> _categories(
    Iterable<Transaction> rows, {
    required bool income,
  }) {
    final totals = <({String? id, String? name}), double>{};
    for (final row in rows) {
      final amount = row.amount!;
      if (amount == 0 || (amount > 0) != income) continue;
      final key = (id: row.categoryId, name: row.categoryName);
      totals.update(key, (total) => total + amount.abs(), ifAbsent: amount.abs);
    }
    return [
      for (final entry in totals.entries)
        (name: entry.key.name, amount: entry.value),
    ]..sort((a, b) => b.amount.compareTo(a.amount));
  }
}

class FinanceReportRateMissing implements Exception {
  const FinanceReportRateMissing();
}
