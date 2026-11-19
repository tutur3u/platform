part of 'finance_repository.dart';

typedef TransactionCreator = ({String id, String? name});

extension FinanceTransactionCreators on FinanceRepository {
  Future<List<TransactionCreator>> getTransactionCreators(
    String workspace,
  ) async {
    final user = _cacheUserId();
    final query = Uri(queryParameters: {'type': 'transaction_creators'}).query;
    final path =
        '/api/v1/workspaces/${Uri.encodeComponent(workspace)}/finance/filter-users?$query';
    Future<Map<String, dynamic>> read() => _api.getJson(path);
    final response = user == null
        ? await read()
        : await ApiClient.runForUser(user, read);
    if (user != _cacheUserId()) return [];
    final users = (response['users'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    return [
      for (final user in users)
        if (user['id'] case final String id)
          (id: id, name: (user['display_name'] as String?)?.trim()),
    ]..sort(
      (a, b) =>
          (a.name ?? '').toLowerCase().compareTo((b.name ?? '').toLowerCase()),
    );
  }
}
