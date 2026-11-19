part of 'finance_repository.dart';

mixin FinanceRepositoryExport {
  ApiClient get _api;
  String? Function() get _cacheUserId;

  static const _columns = [
    'taken_at',
    'amount',
    'transaction_type',
    'description',
    'wallet',
    'category',
    'tags',
    'report_opt_in',
    'created_at',
    'creator_name',
    'creator_email',
    'invoice_for_name',
    'invoice_for_email',
  ];

  Future<String?> exportFinanceTransactions({
    required String workspace,
    required FinanceTransactionQuery filters,
    required String search,
    required String? walletId,
    required bool Function() shouldContinue,
  }) async {
    if (filters.kind == FinanceTransactionKind.transfer) {
      throw ArgumentError('Transfer-only exports are not supported.');
    }
    final userId = _cacheUserId();
    final path = '${FinanceEndpoints.transactions(workspace)}/export';
    final query = {
      ...filters.toParams(),
      if (search.trim().isNotEmpty) 'q': search.trim(),
      if (walletId != null) 'walletIds': walletId,
    };
    const pageSize = 500;
    final csv = StringBuffer()..writeln(_columns.join(','));
    int? count;
    var written = 0;
    for (var page = 1; count == null || written < count; page++) {
      if (!shouldContinue() || userId != _cacheUserId()) return null;
      final params = Uri(
        queryParameters: {...query, 'page': '$page', 'pageSize': '$pageSize'},
      ).query;
      Future<Map<String, dynamic>> fetch() => _api.getJson('$path?$params');
      final response = userId == null
          ? await fetch()
          : await ApiClient.runForUser(userId, fetch);
      if (!shouldContinue() || userId != _cacheUserId()) return null;
      final pageCount = response['count'] as int;
      count ??= pageCount;
      final rows = (response['data'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      if (pageCount != count ||
          rows.length != (count - written).clamp(0, pageSize)) {
        throw const FormatException('Transaction export changed while paging.');
      }
      for (final row in rows) {
        csv.writeln([for (final key in _columns) _csvCell(row[key])].join(','));
        if (csv.length > 10 * 1024 * 1024) {
          throw const FormatException(
            'Transaction export exceeds the mobile size limit.',
          );
        }
      }
      written += rows.length;
    }
    return written == 0 ? null : csv.toString();
  }
}

String _csvCell(Object? value) {
  final text = value?.toString() ?? '';
  final prefix = text.trimLeft();
  final formula =
      value is String && prefix.isNotEmpty && '=+-@'.contains(prefix[0]);
  final escaped = text.replaceAll('"', '""');
  return '"${formula ? "'" : ''}$escaped"';
}
