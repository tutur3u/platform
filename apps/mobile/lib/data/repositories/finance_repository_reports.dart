part of 'finance_repository.dart';

mixin FinanceRepositoryReports {
  ApiClient get _api;
  String? Function() get _cacheUserId;

  Future<List<Transaction>> getReportTransactions({
    required String workspace,
    required String wallet,
    required FinanceTransactionQuery query,
    required bool Function() active,
  }) async {
    final user = _cacheUserId();
    final rows = <String, Transaction>{};
    final visited = <String>{};
    String? cursor;
    for (var page = 0; page < 50; page++) {
      if (!active() || user != _cacheUserId()) return [];
      final params = Uri(
        queryParameters: {
          ...query.toParams(),
          'walletId': wallet,
          'limit': '100',
          if (cursor != null) 'cursor': cursor,
        },
      ).query;
      final path =
          '${FinanceEndpoints.infiniteTransactions(workspace)}?$params';
      Future<Map<String, dynamic>> fetch() => _api.getJson(path);
      final data = user == null
          ? await fetch()
          : await ApiClient.runForUser(user, fetch);
      final response = InfiniteTransactionResponse.fromJson(data);
      for (final row in response.data) {
        rows[row.id] = row;
      }
      if (!response.hasMore) return rows.values.toList();
      cursor = response.nextCursor;
      if (cursor == null || !visited.add(cursor)) break;
    }
    throw const FormatException(
      'Report transaction pagination did not finish.',
    );
  }
}
