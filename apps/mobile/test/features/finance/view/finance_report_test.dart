import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/features/finance/utils/finance_report.dart';

void main() {
  test('report totals reflect eligible rows in the selected period', () {
    final day = DateTime(2026, 11, 10);
    final period = FinancePeriod.containing(FinancePeriodKind.month, day);
    final report = FinanceWalletReport(period, [
      Transaction(id: 'income', takenAt: day, amount: 100),
      Transaction(
        id: 'food',
        takenAt: day,
        amount: -20,
        categoryId: 'food',
        categoryName: 'Food',
      ),
      Transaction(
        id: 'food-2',
        takenAt: day,
        amount: -5,
        categoryId: 'food',
        categoryName: 'Food',
      ),
      Transaction(
        id: 'excluded',
        takenAt: day,
        amount: 300,
        reportOptIn: false,
      ),
      Transaction(id: 'redacted', takenAt: day),
      Transaction(id: 'outside', takenAt: DateTime(2026, 10, 10), amount: 200),
    ]);
    expect(report.income, 100);
    expect(report.expense, 25);
    expect(report.expenseCategories, [(name: 'Food', amount: 25.0)]);
    expect(report.movement.last, 75);
  });
  test('all-wallet reports convert eligible rows before summing them', () {
    final day = DateTime(2026, 11, 10);
    final period = FinancePeriod.containing(FinancePeriodKind.month, day);
    final transactions = [
      Transaction(id: 'a', walletId: 'local', takenAt: day, amount: 50000),
      Transaction(id: 'b', walletId: 'foreign', takenAt: day, amount: -10),
      Transaction(id: 'c', walletId: 'excluded', takenAt: day, amount: -5000),
    ];
    FinanceWalletReport build(List<ExchangeRate> rates) =>
        FinanceWalletReport.workspace(
          period,
          transactions,
          currencies: const {'local': 'VND', 'foreign': 'PLN'},
          targetCurrency: 'VND',
          rates: rates,
        );
    expect(() => build([]), throwsA(isA<FinanceReportRateMissing>()));
    final report = build(const [
      ExchangeRate(
        baseCurrency: 'USD',
        targetCurrency: 'VND',
        rate: 27000,
        date: '2026-11-20',
      ),
      ExchangeRate(
        baseCurrency: 'USD',
        targetCurrency: 'PLN',
        rate: 4,
        date: '2026-11-20',
      ),
    ]);
    expect(report.converted, isTrue);
    expect(report.income, 50000);
    expect(report.expense, 67500);
    expect(report.movement.last, -17500);
  });
}
