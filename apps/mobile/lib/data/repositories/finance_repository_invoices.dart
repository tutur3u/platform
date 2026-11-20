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
    String? promotionId,
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
      'promotion_id': ?promotionId,
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

  Future<List<FinanceSubscriptionGroup>> getSubscriptionGroups(
    String workspace,
    String customerId,
  ) async {
    final user = _cacheUserId();
    final ws = Uri.encodeComponent(workspace);
    final id = Uri.encodeComponent(customerId);
    final rows = await _invoiceRequest(
      user,
      () => _api.getJsonList('/api/v1/workspaces/$ws/users/$id/user-groups'),
    );
    final blocked = await _invoiceRequest(user, () async {
      try {
        final config = await _api.getJson(
          FinanceEndpoints.workspaceConfig(
            workspace,
            'INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION',
          ),
        );
        return (config['value'] as String? ?? '')
            .split(',')
            .map((value) => value.trim())
            .toSet();
      } on ApiException catch (error) {
        if (error.statusCode == 404) return <String>{};
        rethrow;
      }
    });
    return [
      for (final row in rows.cast<Map<String, dynamic>>())
        if (row['workspace_user_groups'] case final Map<String, dynamic> group)
          if (group['id'] case final String id when !blocked.contains(id))
            (
              id: id,
              name: group['name'] as String? ?? id,
              start: DateTime.tryParse(group['starting_date'] as String? ?? ''),
              end: DateTime.tryParse(group['ending_date'] as String? ?? ''),
            ),
    ];
  }

  Future<void> moveInvoiceWallet({
    required String workspace,
    required String id,
    required String walletId,
  }) async {
    final user = _cacheUserId();
    await _invoiceRequest(
      user,
      () => _api.putJson(
        '${_invoicePath(workspace)}/${Uri.encodeComponent(id)}',
        {'wallet_id': walletId},
      ),
    );
    await _invalidateInvoiceViews(user, workspace);
  }

  Future<FinancePageResult<FinanceInvoiceEvent>> getInvoiceHistory(
    String workspace, {
    required String query,
    required int page,
    required bool deleted,
  }) async {
    const pageSize = 25;
    final offset = (page - 1) * pageSize;
    final params = Uri(
      queryParameters: {
        'limit': '$pageSize',
        'offset': '$offset',
        if (deleted) 'deletedOnly': 'true',
        if (query.isNotEmpty) 'q': query,
      },
    ).query;
    final user = _cacheUserId();
    final data = await _invoiceRequest(
      user,
      () => _api.getJson('${_invoicePath(workspace)}/history?$params'),
    );
    final rows = (data['data'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(FinanceInvoiceEvent.fromJson)
        .toList();
    return (
      items: rows,
      count: offset + rows.length + (data['hasMore'] == true ? 1 : 0),
    );
  }

  Future<void> restoreInvoice(String workspace, String id) async {
    final user = _cacheUserId();
    await _invoiceRequest(
      user,
      () => _api.postJson(
        '${_invoicePath(workspace)}/${Uri.encodeComponent(id)}/restore',
        {},
      ),
    );
    await _invalidateInvoiceViews(user, workspace);
  }

  String _feeLocksPath(String workspace) =>
      '/api/v1/workspaces/${Uri.encodeComponent(workspace)}/finance/fee-locks';

  Future<FinancePageResult<FinanceFeeLockRow>> getFeeLocks(
    String workspace, {
    required String month,
    required String query,
    required int page,
  }) async {
    final params = Uri(
      queryParameters: {
        'month': month,
        'page': '$page',
        'pageSize': '25',
        if (query.isNotEmpty) 'q': query,
      },
    ).query;
    final response = await _invoiceRequest(
      _cacheUserId(),
      () => _api.getJson('${_feeLocksPath(workspace)}?$params'),
    );
    final currency = response['currency'] as String;
    return (
      count: response['count'] as int,
      items: [
        for (final row
            in (response['data'] as List<dynamic>).cast<Map<String, dynamic>>())
          FinanceFeeLockRow.fromJson(row, currency),
      ],
    );
  }

  Future<FinanceFeeLockDetail> getFeeLock(String workspace, String id) async {
    final response = await _invoiceRequest(
      _cacheUserId(),
      () => _api.getJson(
        '${_feeLocksPath(workspace)}/${Uri.encodeComponent(id)}',
      ),
    );
    final lock = response['lock'] as Map<String, dynamic>;
    return (
      status: lock['status'] as String,
      version: lock['version'] as int,
      currency: lock['currency'] as String,
      note: lock['note'] as String? ?? '',
      lines: [
        for (final row
            in (response['lines'] as List<dynamic>)
                .cast<Map<String, dynamic>>())
          FinanceFeeLine.fromJson(row),
      ],
    );
  }

  Future<void> saveFeeLockDraft(
    String workspace, {
    required String student,
    required String month,
    required int? version,
    required String note,
    required List<Map<String, dynamic>> lines,
  }) async {
    final user = _cacheUserId();
    await _invoiceRequest(
      user,
      () => _api.putJson(_feeLocksPath(workspace), {
        'student_id': student,
        'month': month,
        if (version != null) 'expected_version': version,
        'note': note,
        'lines': lines,
      }),
    );
  }

  Future<void> changeFeeLock(
    String workspace,
    String id, {
    required int version,
    required String? reopenReason,
  }) async {
    final action = reopenReason == null ? 'lock' : 'reopen';
    await _invoiceRequest(
      _cacheUserId(),
      () => _api.postJson(
        '${_feeLocksPath(workspace)}/${Uri.encodeComponent(id)}/$action',
        {
          'expected_version': version,
          if (reopenReason != null) 'reason': reopenReason,
        },
      ),
    );
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
