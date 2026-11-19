part of 'finance_repository.dart';

typedef FinanceInvoiceReportRow = ({
  String id,
  String name,
  DateTime period,
  double amount,
  int count,
});
typedef FinanceInvoiceReport = ({
  List<FinanceInvoiceReportRow> wallets,
  List<FinanceInvoiceReportRow> creators,
});

mixin FinanceRepositoryReports {
  ApiClient get _api;
  String? Function() get _cacheUserId;

  Future<FinanceInvoiceReport> getInvoiceReport(
    String workspace, {
    required String from,
    required String through,
    required String granularity,
  }) async {
    final user = _cacheUserId();
    final params = Uri(
      queryParameters: {
        'start': from,
        'end': through,
        'granularity': granularity,
      },
    ).query;
    final ws = Uri.encodeComponent(workspace);
    final path = '/api/v1/workspaces/$ws/finance/invoices/analytics?$params';
    final response = user == null
        ? await _api.getJson(path)
        : await ApiClient.runForUser(user, () => _api.getJson(path));
    if (_cacheUserId() != user) {
      throw const ApiException(message: 'Request scope changed', statusCode: 0);
    }
    List<FinanceInvoiceReportRow> rows(String key) => [
      for (final row
          in (response[key] as List<dynamic>).cast<Map<String, dynamic>>())
        (
          id: row['group_id'] as String? ?? '',
          name: row['group_name'] as String,
          period: DateTime.parse(row['period'] as String),
          count: (row['invoice_count'] as num).toInt(),
          amount: (row['total_amount'] as num).toDouble(),
        ),
    ];
    return (wallets: rows('walletData'), creators: rows('creatorData'));
  }

  Future<List<Transaction>> getReportTransactions({
    required String workspace,
    required String? wallet,
    required FinanceTransactionQuery query,
    required bool Function() active,
    List<String> walletIds = const [],
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
          if (wallet != null) 'walletId': wallet,
          if (walletIds.isNotEmpty) 'walletIds': walletIds,
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
