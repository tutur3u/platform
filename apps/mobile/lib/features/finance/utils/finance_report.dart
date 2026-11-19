import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';

typedef FinanceReportCategory = ({String? name, double amount});

class FinanceWalletReport {
  FinanceWalletReport(FinancePeriod period, Iterable<Transaction> transactions)
    : this._(
        period,
        transactions.where((row) {
          final date = (row.takenAt ?? row.createdAt)?.toLocal();
          return date != null &&
              period.contains(date) &&
              row.reportOptIn != false &&
              !row.isTransfer &&
              row.amount != null;
        }),
      );

  FinanceWalletReport._(FinancePeriod period, Iterable<Transaction> rows)
    : buckets = financePeriodBuckets(period, rows),
      incomeCategories = _categories(rows, income: true),
      expenseCategories = _categories(rows, income: false),
      hasRows = rows.isNotEmpty;

  final ({List<double> income, List<double> expense}) buckets;
  final List<FinanceReportCategory> incomeCategories;
  final List<FinanceReportCategory> expenseCategories;
  final bool hasRows;

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
