part of 'inventory_repository.dart';

extension InventoryOfflinePreparation on InventoryRepository {
  Future<void> prepareOffline(String wsId) async {
    final user = _cacheUserId();
    if (user == null) throw StateError('Sign in to download inventory.');
    final manifest = OfflineDownloadManifest(_cacheStore, user, _cacheUserId);
    Future<Map<String, dynamic>> download(
      String namespace,
      String path, {
      Map<String, String> params = const {},
    }) async {
      manifest.checkScope();
      final response = await _api.getJson(path);
      await manifest.save(
        _inventoryCacheKey(namespace, wsId, params: params),
        response,
      );
      return response;
    }

    await download('overview', InventoryEndpoints.overview(wsId));
    await download('stock-health', InventoryEndpoints.analyticsSummary(wsId));
    await download(
      'checkout-defaults',
      '/api/v1/workspaces/$wsId/inventory/product-form-options',
    );
    for (final entry in {
      'owners': InventoryEndpoints.owners(wsId),
      'manufacturers': InventoryEndpoints.manufacturers(wsId),
    }.entries) {
      await download(entry.key, entry.value);
    }
    for (final entry in {
      'product-categories': InventoryEndpoints.productCategories(wsId),
      'product-units': InventoryEndpoints.productUnits(wsId),
      'product-warehouses': InventoryEndpoints.productWarehouses(wsId),
    }.entries) {
      manifest.checkScope();
      final rows = await _api.getJsonList(entry.value);
      await manifest.save(_inventoryCacheKey(entry.key, wsId), rows);
    }
    final periods = await download(
      'sales-periods',
      InventoryEndpoints.salesPeriods(wsId, includeArchived: true),
      params: {'includeArchived': 'true'},
    );
    await download(
      'sales-periods',
      InventoryEndpoints.salesPeriods(wsId),
      params: {'includeArchived': 'false'},
    );
    for (final row in _downloadRows(periods)) {
      if (row['archived'] == true) continue;
      final id = row['id'] as String;
      await download(
        'season-quote',
        InventoryEndpoints.seasonPrices(wsId, id),
        params: {'periodId': id},
      );
    }
    final catalog = <Map<String, dynamic>>[];
    for (var page = 1; page <= 1000; page++) {
      final response = await download(
        'products',
        InventoryEndpoints.products(
          wsId,
          status: 'all',
          page: page,
          pageSize: 100,
        ),
        params: {
          'query': '',
          'status': 'all',
          'page': '$page',
          'pageSize': '100',
        },
      );
      final rows = _downloadRows(response);
      catalog.addAll(rows);
      for (final row in rows) {
        final id = row['id'] as String;
        final detail = await download(
          'product',
          InventoryEndpoints.product(wsId, id),
          params: {'productId': id},
        );
        await _productImageCache.load(
          InventoryProduct.fromJson({...row, ...detail, 'ws_id': wsId}),
          manifest: manifest,
        );
      }
      if (page * 100 >= _downloadCount(response)) break;
      if (rows.isEmpty || page == 1000) {
        throw StateError('Inventory catalog pagination did not finish.');
      }
    }
    await manifest.save(_inventoryCacheKey('product-options', wsId), {
      'data': catalog.where((row) => row['archived'] != true).toList(),
    });
    for (final kind in ['sales', 'audit-logs']) {
      for (var offset = 0; offset < 100000; offset += 100) {
        final response = await download(
          kind,
          kind == 'sales'
              ? InventoryEndpoints.sales(wsId, limit: 100, offset: offset)
              : InventoryEndpoints.auditLogs(wsId, limit: 100, offset: offset),
          params: {
            'limit': '100',
            'offset': '$offset',
            if (kind == 'sales') 'periodId': '',
          },
        );
        final rows = _downloadRows(response);
        if (kind == 'sales') {
          for (final row in rows) {
            final id = row['id'] as String;
            await download(
              'sale-detail',
              InventoryEndpoints.sale(wsId, id),
              params: {'saleId': id},
            );
          }
        }
        if (offset + rows.length >= _downloadCount(response)) break;
        if (rows.isEmpty || offset == 99900) {
          throw StateError('Inventory history pagination did not finish.');
        }
      }
    }
    await manifest.verify();
    await manifest.reconcile(
      workspaceId: wsId,
      namespaces: {
        'inventory.products',
        'inventory.product',
        'inventory.product-image',
        'inventory.sales',
        'inventory.sale-detail',
        'inventory.audit-logs',
      },
    );
    manifest.retain('inventory', wsId);
  }
}

List<Map<String, dynamic>> _downloadRows(Map<String, dynamic> response) {
  if (response['data'] is! List) {
    throw const FormatException('Missing offline collection.');
  }
  return (response['data'] as List<dynamic>).cast<Map<String, dynamic>>();
}

int _downloadCount(Map<String, dynamic> response) {
  if (response['count'] is! num) {
    throw const FormatException('Missing offline collection count.');
  }
  return (response['count'] as num).toInt();
}
