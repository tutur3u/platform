import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/data/models/finance/debt_loan.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Debt and loan endpoint paths, served by the Finance origin.
abstract final class FinanceDebtEndpoints {
  static String debts(String wsId) => '/api/v1/workspaces/$wsId/finance/debts';
  static String summary(String wsId) =>
      '/api/v1/workspaces/$wsId/finance/debts/summary';
  static String debt(String wsId, String debtId) =>
      '/api/v1/workspaces/$wsId/finance/debts/$debtId';
}

/// Debts and loans on the Finance API. Reads go through the offline cache;
/// writes need a connection because the server derives every balance.
class FinanceDebtsRepository {
  FinanceDebtsRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<List<DebtLoan>> list(String wsId, {bool forceRefresh = false}) async {
    final rows = await readThroughJsonList(
      api: _api,
      namespace: 'finance.debts',
      workspaceId: wsId,
      path: FinanceDebtEndpoints.debts(wsId),
      forceRefresh: forceRefresh,
    );
    return rows
        .whereType<Map<String, dynamic>>()
        .map(DebtLoan.fromJson)
        .toList(growable: false);
  }

  Future<DebtLoanSummary> summary(
    String wsId, {
    bool forceRefresh = false,
  }) async => DebtLoanSummary.fromJson(
    await readThroughJson(
      api: _api,
      namespace: 'finance.debtSummary',
      workspaceId: wsId,
      path: FinanceDebtEndpoints.summary(wsId),
      forceRefresh: forceRefresh,
    ),
  );

  Future<DebtLoan> create(String wsId, DebtLoan debt) async =>
      DebtLoan.fromJson(
        await _api.postJson(FinanceDebtEndpoints.debts(wsId), debt.toPayload()),
      );

  Future<void> update(String wsId, DebtLoan debt) =>
      _api.putJson(FinanceDebtEndpoints.debt(wsId, debt.id), debt.toPayload());

  Future<void> setStatus(String wsId, String id, DebtLoanStatus status) => _api
      .putJson(FinanceDebtEndpoints.debt(wsId, id), {'status': status.name});

  Future<void> delete(String wsId, String id) =>
      _api.deleteJson(FinanceDebtEndpoints.debt(wsId, id));
}
