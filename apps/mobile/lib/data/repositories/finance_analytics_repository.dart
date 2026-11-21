import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/data/models/finance/finance_analytics.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Workspace chart endpoint paths, served by the Finance origin.
abstract final class FinanceAnalyticsEndpoints {
  static String incomeExpense(String wsId) =>
      '/api/workspaces/$wsId/finance/charts/income-expense-summary';
  static String balanceTrend(String wsId) =>
      '/api/workspaces/$wsId/finance/charts/balance-trend';
  static String categoryBreakdown(String wsId) =>
      '/api/workspaces/$wsId/transactions/category-breakdown';
}

String _day(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

/// Workspace analytics: server-computed income and expense, balance trend
/// and category totals over an inclusive calendar range. Reads go through
/// the offline cache.
class FinanceAnalyticsRepository {
  FinanceAnalyticsRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  String _path(String base, Map<String, String> query) =>
      Uri(path: base, queryParameters: query).toString();

  Future<FinanceIncomeExpenseSummary> incomeExpense(
    String wsId, {
    required DateTime start,
    required DateTime last,
    required bool monthly,
    bool forceRefresh = false,
  }) async => FinanceIncomeExpenseSummary.fromJson(
    await readThroughJson(
      api: _api,
      namespace: 'finance.analyticsFlow',
      workspaceId: wsId,
      path: _path(FinanceAnalyticsEndpoints.incomeExpense(wsId), {
        'startDate': _day(start),
        'endDate': _day(last),
        'interval': monthly ? 'monthly' : 'daily',
        'includeConfidential': 'true',
      }),
      forceRefresh: forceRefresh,
    ),
  );

  Future<List<FinanceBalancePoint>> balanceTrend(
    String wsId, {
    required DateTime start,
    required DateTime last,
    bool forceRefresh = false,
  }) async {
    final json = await readThroughJson(
      api: _api,
      namespace: 'finance.analyticsBalance',
      workspaceId: wsId,
      path: _path(FinanceAnalyticsEndpoints.balanceTrend(wsId), {
        'startDate': _day(start),
        'endDate': _day(last),
        'maxPoints': '62',
        'includeConfidential': 'true',
      }),
      forceRefresh: forceRefresh,
    );
    return [
      for (final row
          in (json['data'] as List<dynamic>? ?? const [])
              .whereType<Map<String, dynamic>>())
        if (financeAnalyticsDate(row['date']) case final date?)
          FinanceBalancePoint(
            date: date,
            balance: switch (row['balance']) {
              final num value => value.toDouble(),
              _ => 0,
            },
          ),
    ];
  }

  /// Category totals bucketed by the device's day boundaries in [timezone],
  /// an IANA identifier.
  Future<List<FinanceCategoryTotal>> categoryTotals(
    String wsId, {
    required DateTime start,
    required DateTime last,
    required bool income,
    required String timezone,
    bool forceRefresh = false,
  }) async => FinanceCategoryTotal.fromBreakdown(
    await readThroughJsonList(
      api: _api,
      namespace: 'finance.analyticsCategories',
      workspaceId: wsId,
      path: _path(FinanceAnalyticsEndpoints.categoryBreakdown(wsId), {
        'startDate': _day(start),
        'endDate': _day(last),
        'type': income ? 'income' : 'expense',
        'timezone': timezone,
      }),
      forceRefresh: forceRefresh,
    ),
  );
}
