part of 'finance_repository.dart';

mixin FinanceRepositoryInvoices {
  ApiClient get _api;
  CacheStore get _cacheStore;
  String? Function() get _cacheUserId;

  String _invoicePath(String workspace) =>
      '/api/v1/workspaces/${Uri.encodeComponent(workspace)}/finance/invoices';

  Future<FinancePageResult<FinanceInvoice>> getInvoices(
    String workspace, {
    String query = '',
    int page = 1,
  }) => _invoicePage(workspace, query, page, FinanceInvoice.fromJson);

  Future<FinancePageResult<FinancePendingInvoice>> getPendingInvoices(
    String workspace, {
    String query = '',
    int page = 1,
  }) => _invoicePage(
    workspace,
    query,
    page,
    FinancePendingInvoice.fromJson,
    pending: true,
  );

  Future<FinancePageResult<T>> _invoicePage<T>(
    String workspace,
    String query,
    int page,
    T Function(Map<String, dynamic>) decode, {
    bool pending = false,
    int pageSize = 25,
  }) async {
    final params = Uri(
      queryParameters: {
        'page': '$page',
        'pageSize': '$pageSize',
        if (query.isNotEmpty) 'q': query,
        if (pending) 'groupByUser': 'false',
      },
    ).query;
    final path =
        '${_invoicePath(workspace)}${pending ? '/pending' : ''}?$params';
    final user = _cacheUserId();
    final response = await _invoiceRequest(user, () => _api.getJson(path));
    final rows = (response['data'] as List).cast<Map<String, dynamic>>();
    return (
      items: rows.map(decode).toList(growable: false),
      count: response['count'] as int,
    );
  }

  Future<List<List<Object?>>?> getInvoiceExportRows({
    required String workspace,
    required String query,
    required bool pending,
    required bool Function() active,
  }) {
    if (pending) {
      return _collectInvoiceExport(
        workspace: workspace,
        query: query,
        pending: true,
        active: active,
        parse: FinancePendingInvoice.fromJson,
        headers: const [
          'customer_id',
          'customer_name',
          'group_ids',
          'months_due',
          'amount_due',
        ],
        key: (row) => jsonEncode([row.customerId, row.groups]),
        values: (row) => [
          row.customerId,
          row.customer,
          row.groups.join(', '),
          row.months.join(', '),
          row.total,
        ],
      );
    }
    return _collectInvoiceExport(
      workspace: workspace,
      query: query,
      pending: false,
      active: active,
      parse: FinanceInvoice.fromJson,
      headers: const [
        'invoice_id',
        'customer',
        'creator',
        'wallet_id',
        'wallet',
        'amount',
        'created_at',
        'completed_at',
        'subscription_months',
        'notice',
        'note',
      ],
      key: (row) => row.id,
      values: (row) => [
        row.id,
        row.customer,
        row.creator,
        row.walletId,
        row.wallet,
        row.total,
        row.createdAt?.toIso8601String(),
        row.completedAt?.toIso8601String(),
        row.coverage,
        row.notice,
        row.note,
      ],
    );
  }

  Future<List<List<Object?>>?> _collectInvoiceExport<T>({
    required String workspace,
    required String query,
    required bool pending,
    required bool Function() active,
    required T Function(Map<String, dynamic>) parse,
    required List<String> headers,
    required String Function(T) key,
    required List<Object?> Function(T) values,
  }) async {
    const pageSize = 100;
    const rowLimit = 5000;
    final user = _cacheUserId();
    final keys = <String>{};
    final result = <List<Object?>>[headers];
    int? expected;
    for (var page = 1; expected == null || keys.length < expected; page++) {
      if (!active() || _cacheUserId() != user) return null;
      final current = await _invoicePage(
        workspace,
        query,
        page,
        parse,
        pending: pending,
        pageSize: pageSize,
      );
      if (!active() || _cacheUserId() != user) return null;
      expected ??= current.count;
      if (expected > rowLimit ||
          current.count != expected ||
          current.items.length != (expected - keys.length).clamp(0, pageSize)) {
        throw const FormatException('Cannot export a complete invoice report.');
      }
      for (final row in current.items) {
        if (!keys.add(key(row))) {
          throw const FormatException('Invoice export changed while paging.');
        }
        result.add(values(row));
      }
    }
    return result;
  }

  Future<String> createInvoice({
    required String workspace,
    required String walletId,
    required String? customerId,
    required String? categoryId,
    required String content,
    required String notes,
    required List<FinanceInvoiceLine> lines,
    FinanceSubscriptionTerms? subscription,
  }) async {
    final user = _cacheUserId();
    final path = _invoicePath(workspace);
    final payload = {
      'wallet_id': walletId,
      'customer_id': customerId,
      'category_id': categoryId,
      'content': content,
      'notes': notes,
      'products': [for (final row in lines) row.toJson()],
      if (subscription case final terms?) ...{
        'group_ids': terms.groups,
        'selected_month': terms.month,
        'prepaid_month_count': terms.months,
      },
    };
    final result = await _invoiceRequest(
      user,
      () => _api.postJson(
        subscription == null ? path : '$path/subscription',
        payload,
      ),
    );
    await _invalidateInvoiceViews(user, workspace);
    return result['invoice_id'] as String;
  }

  Future<void> updateInvoice({
    required String workspace,
    required String id,
    required String? notice,
    required String? note,
  }) async {
    final user = _cacheUserId();
    await _invoiceRequest(
      user,
      () => _api.putJson(
        '${_invoicePath(workspace)}/${Uri.encodeComponent(id)}',
        {'notice': notice, 'note': note},
      ),
    );
    await _invalidateInvoiceViews(user, workspace);
  }

  Future<void> deleteInvoice(String workspace, String id) async {
    final user = _cacheUserId();
    await _invoiceRequest(
      user,
      () => _api.deleteJson(
        '${_invoicePath(workspace)}/${Uri.encodeComponent(id)}',
      ),
    );
    await _invalidateInvoiceViews(user, workspace);
  }

  Future<T> _invoiceRequest<T>(String? user, Future<T> Function() send) =>
      user == null ? send() : ApiClient.runForUser(user, send);

  Future<void> _invalidateInvoiceViews(String? user, String workspace) async {
    if (user == null || user != _cacheUserId()) return;
    try {
      await _cacheStore.invalidateTags(
        const ['module:finance', 'module:inventory'],
        userId: user,
        workspaceId: workspace,
      );
    } on Object catch (error) {
      debugPrint(
        'Could not refresh invoice-related caches: ${error.runtimeType}',
      );
    }
  }
}
