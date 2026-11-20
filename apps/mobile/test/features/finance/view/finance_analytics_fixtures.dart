import 'package:mobile/data/models/finance/finance_analytics.dart';
import 'package:mobile/data/repositories/finance_analytics_repository.dart';

/// November 2026 analytics for scenes, with the requests it served.
class FinanceSceneAnalyticsRepository extends FinanceAnalyticsRepository {
  FinanceSceneAnalyticsRepository({this.failure});

  /// Thrown by every read when set.
  final Exception? failure;
  final requests = <String>[];

  @override
  Future<FinanceIncomeExpenseSummary> incomeExpense(
    String wsId, {
    required DateTime start,
    required DateTime last,
    required bool monthly,
    bool forceRefresh = false,
  }) async {
    if (failure case final error?) throw error;
    requests.add('flow:${start.month}-${last.day}:$monthly');
    return FinanceIncomeExpenseSummary(
      points: [
        for (var day = 1; day <= 20; day++)
          FinanceFlowPoint(
            date: DateTime(2026, 11, day),
            income: day == 19 ? 32000000 : 0,
            expense: 150000.0 * (day % 5 + 1),
          ),
      ],
      totalIncome: 32000000,
      totalExpense: 8420000,
      netTotal: 23580000,
      openingBalance: 41200000,
      closingBalance: 64780000,
    );
  }

  @override
  Future<List<FinanceBalancePoint>> balanceTrend(
    String wsId, {
    required DateTime start,
    required DateTime last,
    bool forceRefresh = false,
  }) async {
    if (failure case final error?) throw error;
    return [
      for (var day = 1; day <= 20; day++)
        FinanceBalancePoint(
          date: DateTime(2026, 11, day),
          balance: 41200000 - 421000.0 * day + (day >= 19 ? 32000000 : 0),
        ),
    ];
  }

  @override
  Future<List<FinanceCategoryTotal>> categoryTotals(
    String wsId, {
    required DateTime start,
    required DateTime last,
    required bool income,
    required String timezone,
    bool forceRefresh = false,
  }) async {
    if (failure case final error?) throw error;
    requests.add('categories:${income ? 'income' : 'expense'}:$timezone');
    return income
        ? const [
            FinanceCategoryTotal(
              id: 'salary',
              name: 'Salary',
              total: 32000000,
              color: '#22c55e',
            ),
          ]
        : const [
            FinanceCategoryTotal(
              id: 'food',
              name: 'Groceries',
              total: 4200000,
              icon: 'ShoppingCart',
            ),
            FinanceCategoryTotal(
              id: 'transport',
              name: 'Transport',
              total: 2520000,
            ),
            FinanceCategoryTotal(
              id: 'books',
              name: 'Education',
              total: 1700000,
            ),
          ];
  }
}
