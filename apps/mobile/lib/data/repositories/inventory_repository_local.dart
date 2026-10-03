part of 'inventory_repository.dart';

extension _InventoryLocalReads on InventoryRepository {
  Future<({List<InventoryAuditLogEntry> data, int count})> _localAuditLogs(
    String wsId, {
    required int limit,
    required int offset,
  }) async {
    final rows = await queryLocalRows(
      store: _cacheStore,
      userId: _cacheUserId(),
      workspaceId: wsId,
      namespaces: const ['inventory.audit-logs'],
    );
    final entries = rows.map(InventoryAuditLogEntry.fromJson).toList()
      ..sort((a, b) => b.occurredAt.compareTo(a.occurredAt));
    return (
      data: entries.skip(offset).take(limit).toList(),
      count: entries.length,
    );
  }

  Future<({List<InventoryAuditLogEntry> data, int count})> _getAuditLogs(
    String wsId, {
    required int limit,
    required int offset,
    required bool forceRefresh,
  }) async {
    if (!await _networkAvailable()) {
      return await _localAuditLogs(wsId, limit: limit, offset: offset);
    }
    try {
      return await _cachedInventoryMap(
        namespace: 'audit-logs',
        wsId: wsId,
        forceRefresh: forceRefresh,
        tags: const ['inventory:audit'],
        params: {'limit': '$limit', 'offset': '$offset'},
        fetch: () async {
          try {
            return await _api.getJson(
              InventoryEndpoints.auditLogs(wsId, limit: limit, offset: offset),
            );
          } on ApiException catch (error) {
            if (error.statusCode == 401 ||
                (error.statusCode == 403 && !error.isVerificationRequired)) {
              await _cacheStore.clearScope(
                userId: _cacheUserId(),
                workspaceId: wsId,
                namespace: 'inventory.audit-logs',
                resourceOnly: true,
              );
            }
            rethrow;
          }
        },
        decode: (response) => (
          data: (response['data'] as List<dynamic>? ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(InventoryAuditLogEntry.fromJson)
              .toList(growable: false),
          count: (response['count'] as num?)?.toInt() ?? 0,
        ),
      );
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      return await _localAuditLogs(wsId, limit: limit, offset: offset);
    }
  }

  Future<({List<InventorySaleSummary> data, int count, bool realtimeEnabled})>
  _localSales(
    String wsId, {
    required int limit,
    required int offset,
    String? periodId,
  }) async {
    final rows = await queryLocalRows(
      store: _cacheStore,
      userId: _cacheUserId(),
      workspaceId: wsId,
      namespaces: const ['inventory.sales', 'inventory.sale-detail'],
    );
    final pending = await _mutationQueue.listPending();
    final assignments = <String, String?>{
      for (final edit in pending)
        if (edit.feature == 'inventory' &&
            edit.workspaceId == wsId &&
            edit.method == 'PUT' &&
            edit.path.endsWith('/period') &&
            edit.entityId != null)
          edit.entityId!: edit.payload?['period_id'] as String?,
    };
    final sales = rows
        .map(InventorySaleSummary.fromJson)
        .where(
          (sale) =>
              periodId == null ||
              (assignments.containsKey(sale.id)
                      ? assignments[sale.id]
                      : sale.period?.id) ==
                  periodId,
        )
        .toList(growable: false);
    final result = _overlayPendingInventorySales(
      wsId,
      (data: sales, count: sales.length, realtimeEnabled: false),
      periodId: periodId,
      pending: pending,
    );
    final sorted = result.data.toList()
      ..sort(
        (a, b) =>
            (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)),
      );
    return (
      data: sorted.skip(offset).take(limit).toList(growable: false),
      count: sorted.length,
      realtimeEnabled: false,
    );
  }

  Future<InventorySaleDetail> _getSaleDetail(
    String wsId,
    String saleId, {
    bool forceRefresh = false,
  }) async {
    final edits = (await _mutationQueue.listPending())
        .where(
          (edit) =>
              edit.feature == 'inventory' &&
              edit.workspaceId == wsId &&
              edit.entityId == saleId,
        )
        .toList(growable: false);
    if (edits.any(
      (edit) =>
          edit.method == 'DELETE' &&
          edit.path == InventoryEndpoints.sale(wsId, saleId),
    )) {
      throw const ApiException(
        message: 'Sale removed locally',
        statusCode: 404,
      );
    }
    final create = edits
        .where(
          (edit) =>
              edit.method == 'POST' &&
              edit.path == InventoryEndpoints.invoices(wsId),
        )
        .firstOrNull;
    if (create != null) {
      return await _pendingSaleDetail(wsId, saleId, create.payload!, edits);
    }
    final confirmed = await _cachedInventoryMap<InventorySaleDetail>(
      namespace: 'sale-detail',
      wsId: wsId,
      forceRefresh: forceRefresh,
      policy: CachePolicies.detail,
      tags: const ['inventory:sale-detail'],
      params: {'saleId': saleId},
      fetch: () => _api.getJson(InventoryEndpoints.sale(wsId, saleId)),
      decode: (response) => InventorySaleDetail.fromJson(
        Map<String, dynamic>.from(response['data'] as Map),
      ),
    );
    final update = edits
        .where(
          (edit) =>
              edit.method == 'PUT' &&
              edit.path == InventoryEndpoints.sale(wsId, saleId),
        )
        .lastOrNull;
    if (update == null) return confirmed;
    return await _pendingSaleDetail(
      wsId,
      saleId,
      update.payload!,
      edits,
      previous: confirmed,
    );
  }

  Future<({List<InventoryProduct> data, int count})> _getProducts(
    String wsId, {
    String? query,
    String status = 'active',
    int page = 1,
    int pageSize = 20,
    bool forceRefresh = false,
  }) async {
    if (!await _networkAvailable()) {
      return await _localProducts(
        wsId,
        query: query,
        status: status,
        page: page,
        pageSize: pageSize,
      );
    }
    try {
      final result =
          await _cachedInventoryMap<({List<InventoryProduct> data, int count})>(
            namespace: 'products',
            wsId: wsId,
            forceRefresh: forceRefresh,
            tags: const ['inventory:catalog'],
            params: {
              'query': query?.trim() ?? '',
              'status': status,
              'page': '$page',
              'pageSize': '$pageSize',
            },
            fetch: () => _api.getJson(
              InventoryEndpoints.products(
                wsId,
                query: query,
                status: status,
                page: page,
                pageSize: pageSize,
              ),
            ),
            decode: (response) => (
              data: (response['data'] as List<dynamic>? ?? const <dynamic>[])
                  .whereType<Map<String, dynamic>>()
                  .map(InventoryProduct.fromJson)
                  .toList(growable: false),
              count: (response['count'] as num?)?.toInt() ?? 0,
            ),
          );
      if (_cacheUserId() != null &&
          _catalogBackfill == null &&
          (_catalogBackfillAt == null ||
              DateTime.now().difference(_catalogBackfillAt!) >=
                  const Duration(minutes: 15))) {
        _catalogBackfillAt = DateTime.now();
        _catalogBackfill =
            ApiClient.offlinePreparation(
              () async {
                final user = _cacheUserId();
                for (var index = 1; index <= 5; index++) {
                  if (_cacheUserId() != user) return;
                  final response =
                      await _cachedInventoryMap<Map<String, dynamic>>(
                        namespace: 'products',
                        wsId: wsId,
                        tags: const ['inventory:catalog'],
                        params: {
                          'query': '',
                          'status': 'all',
                          'page': '$index',
                          'pageSize': '100',
                        },
                        fetch: () => _api.getJson(
                          InventoryEndpoints.products(
                            wsId,
                            status: 'all',
                            page: index,
                            pageSize: 100,
                          ),
                        ),
                        decode: (value) => value,
                      );
                  if (index * 100 >= (response['count'] as num? ?? 0)) break;
                }
              },
              allowChallenge: false,
            ).then<void>((_) {}, onError: (Object _) {}).whenComplete(() {
              _catalogBackfill = null;
            });
      }
      final data = overlayPendingProducts(
        wsId,
        result.data,
        await _mutationQueue.listPending(),
        query: query?.trim(),
        includeCreates: page == 1 && status == 'active',
      );
      return (
        data: data,
        count: result.count + data.length - result.data.length,
      );
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      return await _localProducts(
        wsId,
        query: query,
        status: status,
        page: page,
        pageSize: pageSize,
      );
    }
  }

  Future<List<InventoryProduct>> _getProductOptions(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    if (!await _networkAvailable()) {
      return (await _localCatalog(
        wsId,
      )).where((row) => !row.archived).toList(growable: false);
    }
    try {
      final products = await _cachedInventoryMap<List<InventoryProduct>>(
        namespace: 'product-options',
        wsId: wsId,
        forceRefresh: forceRefresh,
        policy: CachePolicies.offlineCatalog,
        tags: const ['inventory:catalog'],
        fetch: () => _api.getJson(InventoryEndpoints.productOptions(wsId)),
        decode: (response) =>
            (response['data'] as List<dynamic>? ?? const <dynamic>[])
                .whereType<Map<String, dynamic>>()
                .map((row) => _normalizeOptionProduct(row, wsId: wsId))
                .map(InventoryProduct.fromJson)
                .toList(growable: false),
      );
      return overlayPendingProducts(
        wsId,
        products,
        await _mutationQueue.listPending(),
      );
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      return (await _localCatalog(
        wsId,
      )).where((row) => !row.archived).toList(growable: false);
    }
  }

  Future<InventorySaleDetail> _pendingSaleDetail(
    String wsId,
    String id,
    Map<String, dynamic> payload,
    List<PendingMutationRecord> edits, {
    InventorySaleDetail? previous,
  }) async {
    final products = {
      for (final product in await _localCatalog(wsId)) product.id: product,
    };
    var body = payload;
    for (final edit in edits) {
      if (edit.method == 'PUT' &&
          edit.path == InventoryEndpoints.sale(wsId, id)) {
        body = {...body, ...?edit.payload};
      }
    }
    final lines = (body['products'] as List? ?? const [])
        .whereType<Map<dynamic, dynamic>>()
        .map((row) {
          final product = products[row['product_id']];
          final stock = product?.inventory
              .where(
                (stock) =>
                    stock.unitId == row['unit_id'] &&
                    stock.warehouseId == row['warehouse_id'],
              )
              .firstOrNull;
          return InventorySaleLine.fromJson({
            ...Map<String, dynamic>.from(row),
            'quantity': row['quantity'] ?? row['amount'],
            'product_name': product?.name ?? row['product_id'],
            'unit_name': stock?.unitName,
            'warehouse_name': stock?.warehouseName,
          });
        })
        .toList(growable: false);
    final effectiveLines = body.containsKey('products')
        ? lines
        : previous?.lines ?? lines;
    var period = previous?.period;
    final periodId = body['inventory_period_id'] as String?;
    if (periodId != null) {
      final periods = await queryLocalRows(
        store: _cacheStore,
        userId: _cacheUserId(),
        workspaceId: wsId,
        namespaces: const ['inventory.sales-periods'],
      );
      final row = periods.where((row) => row['id'] == periodId).firstOrNull;
      if (row != null) period = InventorySalesPeriod.fromJson(row);
    }
    return InventorySaleDetail(
      id: id,
      notice: body['notice'] as String? ?? body['content'] as String?,
      note: body['note'] as String? ?? body['notes'] as String?,
      paidAmount: previous?.paidAmount ?? 0,
      itemsCount: effectiveLines.length,
      totalQuantity: effectiveLines.fold(
        0,
        (total, line) => total + line.quantity,
      ),
      owners: previous?.owners ?? const [],
      lines: effectiveLines,
      source: previous?.source ?? 'finance_invoice',
      createdAt: previous?.createdAt ?? edits.first.createdAt,
      walletId: body['wallet_id'] as String?,
      categoryId: body['category_id'] as String?,
      walletName: previous?.walletName,
      categoryName: previous?.categoryName,
      period: period,
    );
  }

  Future<List<InventoryProduct>> _localCatalog(String wsId) async {
    final rows = await queryLocalRows(
      store: _cacheStore,
      userId: _cacheUserId(),
      workspaceId: wsId,
      namespaces: const [
        'inventory.product-options',
        'inventory.products',
        'inventory.product',
      ],
    );
    final snapshot = await _cacheStore.read<List<Map<String, dynamic>>>(
      key: _inventoryCacheKey('product-options', wsId),
      decode: (value) =>
          (Map<String, dynamic>.from(value! as Map)['data'] as List? ??
                  const [])
              .whereType<Map<String, dynamic>>()
              .toList(growable: false),
    );
    final indexedIds = rows.map((row) => row['id']).toSet();
    rows.addAll(
      (snapshot.data ?? const []).where(
        (row) => !indexedIds.contains(row['id']),
      ),
    );
    final products = rows
        .map(
          (row) => InventoryProduct.fromJson(
            row.containsKey('inventory_products')
                ? _normalizeOptionProduct(row, wsId: wsId)
                : row,
          ),
        )
        .toList(growable: false);
    return overlayPendingProducts(
      wsId,
      products,
      await _mutationQueue.listPending(),
    );
  }

  Future<({List<InventoryProduct> data, int count})> _localProducts(
    String wsId, {
    required String status,
    required int page,
    required int pageSize,
    String? query,
  }) async {
    final products =
        (await _localCatalog(wsId))
            .where(
              (product) =>
                  (status == 'all' ||
                      product.archived == (status == 'archived')) &&
                  inventoryProductMatchesQuery(product, query),
            )
            .toList(growable: false)
          ..sort((a, b) {
            final date = (b.createdAt ?? DateTime(0)).compareTo(
              a.createdAt ?? DateTime(0),
            );
            return date == 0 ? a.id.compareTo(b.id) : date;
          });
    return (
      data: products
          .skip((page - 1).clamp(0, 100000) * pageSize)
          .take(pageSize)
          .toList(growable: false),
      count: products.length,
    );
  }
}
