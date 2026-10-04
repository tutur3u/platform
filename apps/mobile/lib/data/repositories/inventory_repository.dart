import 'dart:async';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/local_replica_query.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/inventory/inventory_checkout_defaults.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/inventory/inventory_season_price.dart';
import 'package:mobile/data/models/inventory/inventory_stock_health.dart';
import 'package:mobile/data/repositories/inventory_pending_overlay.dart';
import 'package:mobile/data/repositories/inventory_product_image_cache.dart';
import 'package:mobile/data/sources/api_client.dart';

part 'inventory_repository_cache.dart';
part 'inventory_repository_local.dart';
part 'inventory_repository_offline_preparation.dart';
part 'inventory_repository_product_mutations.dart';
part 'inventory_repository_sales_pending.dart';
part 'inventory_repository_sales_period_mutations.dart';
part 'inventory_repository_season_pricing.dart';
part 'inventory_repository_setup_pending.dart';

class InventoryRepository {
  InventoryRepository({
    ApiClient? apiClient,
    CacheStore? cacheStore,
    OfflineMutationQueue? mutationQueue,
    String? Function()? cacheUserId,
    Future<bool> Function()? networkAvailable,
    InventoryProductImageCache? productImageCache,
  }) : _api = apiClient ?? ApiClient(),
       _cacheStore = cacheStore ?? CacheStore.instance,
       _mutationQueue = mutationQueue ?? OfflineMutationQueue.instance,
       _cacheUserId = cacheUserId ?? currentCacheUserId,
       _networkAvailable = networkAvailable ?? hasNetworkConnection,
       _productImageCache =
           productImageCache ??
           InventoryProductImageCache(
             store: cacheStore,
             currentUserId: cacheUserId,
           );

  final ApiClient _api;
  final CacheStore _cacheStore;
  final OfflineMutationQueue _mutationQueue;
  final String? Function() _cacheUserId;
  final Future<bool> Function() _networkAvailable;
  final InventoryProductImageCache _productImageCache;
  Future<void>? _catalogBackfill;
  DateTime? _catalogBackfillAt;
  InventorySaleDetail? peekSaleDetail(String wsId, String saleId) =>
      _peekSaleDetail(wsId, saleId);

  Map<String, dynamic> _buildProductPayload({
    required String name,
    required String categoryId,
    required String ownerId,
    required List<InventoryStockEntry> inventory,
    String? manufacturerId,
    String? description,
    String? usage,
    String? financeCategoryId,
  }) {
    return {
      'name': name,
      'category_id': categoryId,
      'owner_id': ownerId,
      'manufacturer_id': manufacturerId,
      if (description != null) 'description': description,
      if (usage != null) 'usage': usage,
      if (financeCategoryId != null) 'finance_category_id': financeCategoryId,
      'inventory': inventory
          .map(
            (row) => {
              'unit_id': row.unitId,
              'warehouse_id': row.warehouseId,
              'amount': row.amount,
              'min_amount': row.minAmount,
              'price': row.price,
            },
          )
          .toList(growable: false),
    };
  }

  Map<String, dynamic> _normalizeOptionProduct(
    Map<String, dynamic> json, {
    required String wsId,
  }) {
    if (json.containsKey('inventory')) return {...json, 'ws_id': wsId};
    final owner = json['inventory_owners'] is Map<String, dynamic>
        ? Map<String, dynamic>.from(
            json['inventory_owners'] as Map<String, dynamic>,
          )
        : null;
    final financeCategory =
        json['transaction_categories'] is Map<String, dynamic>
        ? Map<String, dynamic>.from(
            json['transaction_categories'] as Map<String, dynamic>,
          )
        : null;
    final productCategory = json['product_categories'] is Map<String, dynamic>
        ? Map<String, dynamic>.from(
            json['product_categories'] as Map<String, dynamic>,
          )
        : null;
    final inventory =
        (json['inventory_products'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(
              (row) => {
                'unit_id': row['unit_id'],
                'warehouse_id': row['warehouse_id'],
                'amount': row['amount'],
                'min_amount': row['min_amount'] ?? 0,
                'price': row['price'] ?? 0,
                'unit_name':
                    (row['inventory_units'] as Map<String, dynamic>?)?['name'],
                'warehouse_name':
                    (row['inventory_warehouses']
                        as Map<String, dynamic>?)?['name'],
              },
            )
            .toList(growable: false);

    return {
      'id': json['id'],
      'name': json['name'],
      'avatar_url': json['avatar_url'],
      'manufacturer_id': json['manufacturer_id'],
      'manufacturer': json['manufacturer'],
      'description': json['description'],
      'usage': json['usage'],
      'category': productCategory?['name'],
      'category_id': json['category_id'],
      'owner_id': json['owner_id'],
      'owner': owner,
      'finance_category_id': json['finance_category_id'],
      'finance_category': financeCategory,
      'ws_id': wsId,
      'created_at': json['created_at'],
      'archived': false,
      'inventory': inventory,
    };
  }

  List<InventoryLookupItem> _decodeLookupMap(Map<String, dynamic> response) {
    return (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(InventoryLookupItem.fromJson)
        .toList(growable: false);
  }

  List<InventoryLookupItem> _decodeLookupList(List<dynamic> response) {
    return response
        .whereType<Map<String, dynamic>>()
        .map(InventoryLookupItem.fromJson)
        .toList(growable: false);
  }

  /// Last confirmed counts remain available offline; they exclude local drafts.
  Future<InventoryStockHealth> getStockHealth(String wsId) =>
      _cachedInventoryMap(
        namespace: 'stock-health',
        wsId: wsId,
        tags: const ['inventory:catalog'],
        fetch: () => _api.getJson(InventoryEndpoints.analyticsSummary(wsId)),
        decode: InventoryStockHealth.fromJson,
      );

  Future<InventoryOverview> getOverview(
    String wsId, {
    bool forceRefresh = false,
  }) {
    return _cachedInventoryMap(
      namespace: 'overview',
      wsId: wsId,
      policy: CachePolicies.summary,
      forceRefresh: forceRefresh,
      tags: const ['inventory:overview'],
      fetch: () => _api.getJson(InventoryEndpoints.overview(wsId)),
      decode: InventoryOverview.fromJson,
    );
  }

  Future<({List<InventoryProduct> data, int count})> getProducts(
    String wsId, {
    String? query,
    String status = 'active',
    int page = 1,
    int pageSize = 20,
    bool forceRefresh = false,
  }) => _getProducts(
    wsId,
    query: query,
    status: status,
    page: page,
    pageSize: pageSize,
    forceRefresh: forceRefresh,
  );

  Future<InventoryProduct?> getProduct(
    String wsId,
    String productId, {
    bool forceRefresh = false,
  }) async {
    if (!await _networkAvailable()) {
      return (await _localCatalog(
        wsId,
      )).where((row) => row.id == productId).firstOrNull;
    }
    InventoryProduct? product;
    ApiException? offlineError;
    try {
      product = await _cachedInventoryMap(
        namespace: 'product',
        wsId: wsId,
        forceRefresh: forceRefresh,
        tags: const ['inventory:catalog'],
        params: {'productId': productId},
        fetch: () => _api.getJson(InventoryEndpoints.product(wsId, productId)),
        decode: InventoryProduct.fromJson,
      );
    } on ApiException catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      offlineError = error;
    }
    final rows = overlayPendingProducts(wsId, [
      if (product != null) product,
    ], await _mutationQueue.listPending());
    for (final row in rows) {
      if (row.id == productId) return row;
    }
    if (offlineError != null) throw offlineError;
    return product;
  }

  Future<List<InventoryProduct>> getProductOptions(
    String wsId, {
    bool forceRefresh = false,
  }) => _getProductOptions(wsId, forceRefresh: forceRefresh);

  Future<List<InventoryOwner>> getOwners(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final owners = await _setupRows(
      forceRefresh,
      _cachedInventoryMap<List<InventoryOwner>>(
        namespace: 'owners',
        wsId: wsId,
        forceRefresh: forceRefresh,
        policy: CachePolicies.metadata,
        tags: const ['inventory:setup'],
        fetch: () => _api.getJson(InventoryEndpoints.owners(wsId)),
        decode: (response) =>
            (response['data'] as List<dynamic>? ?? const <dynamic>[])
                .whereType<Map<String, dynamic>>()
                .map(InventoryOwner.fromJson)
                .toList(growable: false),
      ),
    );
    return _overlayPendingInventorySetup(
      wsId,
      InventoryEndpoints.owners(wsId),
      owners,
      (id, name) => InventoryOwner(id: id, name: name),
      pending: _mutationQueue.pending.value,
    );
  }

  Future<void> createOwner(String wsId, String name) async {
    await _queueInventorySetupCreate(
      wsId,
      InventoryEndpoints.owners(wsId),
      name,
    );
    await _invalidateInventory(wsId, const [
      'inventory:setup',
      'inventory:catalog',
    ]);
  }

  Future<List<InventoryLookupItem>> getManufacturers(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final rows = await _setupRows(
      forceRefresh,
      _cachedInventoryMap<List<InventoryLookupItem>>(
        namespace: 'manufacturers',
        wsId: wsId,
        forceRefresh: forceRefresh,
        policy: CachePolicies.metadata,
        tags: const ['inventory:setup'],
        fetch: () => _api.getJson(InventoryEndpoints.manufacturers(wsId)),
        decode: _decodeLookupMap,
      ),
    );
    return _overlayPendingInventorySetup(
      wsId,
      InventoryEndpoints.manufacturers(wsId),
      rows,
      (id, name) => InventoryLookupItem(id: id, name: name),
      pending: _mutationQueue.pending.value,
    );
  }

  Future<void> createManufacturer(String wsId, String name) async {
    await _queueInventorySetupCreate(
      wsId,
      InventoryEndpoints.manufacturers(wsId),
      name,
    );
    await _invalidateInventory(wsId, const ['inventory:setup']);
  }

  Future<List<InventoryLookupItem>> getProductCategories(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final rows = await _setupRows(
      forceRefresh,
      _cachedInventoryList<List<InventoryLookupItem>>(
        namespace: 'product-categories',
        wsId: wsId,
        forceRefresh: forceRefresh,
        tags: const ['inventory:setup'],
        fetch: () =>
            _api.getJsonList(InventoryEndpoints.productCategories(wsId)),
        decode: _decodeLookupList,
      ),
    );
    return _overlayPendingInventorySetup(
      wsId,
      InventoryEndpoints.productCategories(wsId),
      rows,
      (id, name) => InventoryLookupItem(id: id, name: name),
      pending: _mutationQueue.pending.value,
    );
  }

  Future<void> createProductCategory(String wsId, String name) async {
    await _queueInventorySetupCreate(
      wsId,
      InventoryEndpoints.productCategories(wsId),
      name,
    );
    await _invalidateInventory(wsId, const [
      'inventory:setup',
      'inventory:catalog',
    ]);
  }

  Future<List<InventoryLookupItem>> getProductUnits(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final rows = await _setupRows(
      forceRefresh,
      _cachedInventoryList<List<InventoryLookupItem>>(
        namespace: 'product-units',
        wsId: wsId,
        forceRefresh: forceRefresh,
        tags: const ['inventory:setup'],
        fetch: () => _api.getJsonList(InventoryEndpoints.productUnits(wsId)),
        decode: _decodeLookupList,
      ),
    );
    return _overlayPendingInventorySetup(
      wsId,
      InventoryEndpoints.productUnits(wsId),
      rows,
      (id, name) => InventoryLookupItem(id: id, name: name),
      pending: _mutationQueue.pending.value,
    );
  }

  Future<void> createProductUnit(String wsId, String name) async {
    await _queueInventorySetupCreate(
      wsId,
      InventoryEndpoints.productUnits(wsId),
      name,
    );
    await _invalidateInventory(wsId, const ['inventory:setup']);
  }

  Future<List<InventoryLookupItem>> getProductWarehouses(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final rows = await _setupRows(
      forceRefresh,
      _cachedInventoryList<List<InventoryLookupItem>>(
        namespace: 'product-warehouses',
        wsId: wsId,
        forceRefresh: forceRefresh,
        tags: const ['inventory:setup'],
        fetch: () =>
            _api.getJsonList(InventoryEndpoints.productWarehouses(wsId)),
        decode: _decodeLookupList,
      ),
    );
    return _overlayPendingInventorySetup(
      wsId,
      InventoryEndpoints.productWarehouses(wsId),
      rows,
      (id, name) => InventoryLookupItem(id: id, name: name),
      pending: _mutationQueue.pending.value,
    );
  }

  Future<void> createProductWarehouse(String wsId, String name) async {
    await _queueInventorySetupCreate(
      wsId,
      InventoryEndpoints.productWarehouses(wsId),
      name,
    );
    await _invalidateInventory(wsId, const ['inventory:setup']);
  }

  Future<({List<InventorySaleSummary> data, int count, bool realtimeEnabled})>
  getSales(
    String wsId, {
    int limit = 20,
    int offset = 0,
    String? periodId,
    bool forceRefresh = false,
  }) async {
    if (!await _networkAvailable()) {
      return await _localSales(
        wsId,
        limit: limit,
        offset: offset,
        periodId: periodId,
      );
    }
    final ({List<InventorySaleSummary> data, int count, bool realtimeEnabled})
    result;
    try {
      result =
          await _cachedInventoryMap<
            ({List<InventorySaleSummary> data, int count, bool realtimeEnabled})
          >(
            namespace: 'sales',
            wsId: wsId,
            forceRefresh: forceRefresh,
            tags: const ['inventory:sales'],
            params: {
              'limit': '$limit',
              'offset': '$offset',
              'periodId': periodId ?? '',
            },
            fetch: () => _api.getJson(
              InventoryEndpoints.sales(
                wsId,
                limit: limit,
                offset: offset,
                periodId: periodId,
              ),
            ),
            decode: (response) => (
              data: (response['data'] as List<dynamic>? ?? const <dynamic>[])
                  .whereType<Map<String, dynamic>>()
                  .map(InventorySaleSummary.fromJson)
                  .toList(growable: false),
              count: (response['count'] as num?)?.toInt() ?? 0,
              realtimeEnabled: response['realtime_enabled'] as bool? ?? false,
            ),
          );
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      return await _localSales(
        wsId,
        limit: limit,
        offset: offset,
        periodId: periodId,
      );
    }
    return _overlayPendingInventorySales(
      wsId,
      result,
      periodId: periodId,
      includeCreates: offset == 0,
      pending: await _mutationQueue.listPending(),
    );
  }

  Future<List<InventorySalesPeriod>> getSalesPeriods(
    String wsId, {
    bool includeArchived = true,
    bool forceRefresh = false,
  }) async {
    final periods = await _setupRows(
      forceRefresh,
      _cachedInventoryMap<List<InventorySalesPeriod>>(
        namespace: 'sales-periods',
        wsId: wsId,
        forceRefresh: forceRefresh,
        policy: CachePolicies.metadata,
        tags: const ['inventory:periods'],
        params: {'includeArchived': '$includeArchived'},
        fetch: () => _api.getJson(
          InventoryEndpoints.salesPeriods(
            wsId,
            includeArchived: includeArchived,
          ),
        ),
        decode: (response) =>
            (response['data'] as List<dynamic>? ?? const <dynamic>[])
                .whereType<Map<String, dynamic>>()
                .map(InventorySalesPeriod.fromJson)
                .toList(growable: false),
      ),
    );
    return _overlayPendingSalesPeriods(
      wsId,
      periods,
      includeArchived: includeArchived,
      pending: await _mutationQueue.listPending(),
    );
  }

  Future<InventorySalesPeriod?> setSalePeriod({
    required String wsId,
    required String saleId,
    required String source,
    required String? periodId,
  }) async {
    final path = InventoryEndpoints.salePeriod(wsId, saleId);
    final payload = {'period_id': periodId, 'source': source};
    final period = await queueOrSendValue<InventorySalesPeriod?>(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'inventory',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      entityId: saleId,
      payload: payload,
      acknowledgedValue: (data) =>
          data.containsKey('data') && data['data'] == null
          ? null
          : InventorySalesPeriod.fromJson(data),
      pendingValue: (_) => null,
      send: () async {
        final response = await _api.putJson(path, payload);
        final data = response['data'];
        return data is Map
            ? InventorySalesPeriod.fromJson(Map<String, dynamic>.from(data))
            : null;
      },
    );
    await _invalidateInventory(wsId, const [
      'inventory:periods',
      'inventory:sales',
      'inventory:sale-detail',
    ]);
    return period;
  }

  Future<InventorySaleDetail> getSaleDetail(
    String wsId,
    String saleId, {
    bool forceRefresh = false,
  }) => _getSaleDetail(wsId, saleId, forceRefresh: forceRefresh);

  Future<InventorySaleDetail> updateSale({
    required String wsId,
    required String saleId,
    String? notice,
    String? note,
    String? walletId,
    String? categoryId,
    List<Map<String, dynamic>>? products,
    InventorySaleDetail? previous,
  }) async {
    final path = InventoryEndpoints.sale(wsId, saleId);
    final payload = {
      'notice': notice,
      'note': note,
      'wallet_id': walletId,
      'category_id': categoryId,
      if (products != null) 'products': products,
    };
    final sale = await queueOrSendValue<InventorySaleDetail>(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'inventory',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      entityId: saleId,
      payload: payload,
      acknowledgedValue: InventorySaleDetail.fromJson,
      pendingValue: (_) => InventorySaleDetail(
        id: saleId,
        notice: notice,
        note: note,
        paidAmount: previous?.paidAmount ?? 0,
        itemsCount: previous?.itemsCount ?? 0,
        totalQuantity: previous?.totalQuantity ?? 0,
        owners: previous?.owners ?? const [],
        lines: previous?.lines ?? const [],
        source: previous?.source ?? 'finance_invoice',
        walletId: walletId,
        categoryId: categoryId,
        period: previous?.period,
      ),
      send: () async {
        final response = await _api.putJson(path, payload);
        return InventorySaleDetail.fromJson(
          Map<String, dynamic>.from(response['data'] as Map),
        );
      },
    );
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:sales',
      'inventory:sale-detail',
    ]);
    return sale;
  }

  Future<void> deleteSale(String wsId, String saleId) async {
    final path = InventoryEndpoints.sale(wsId, saleId);
    await queueOrSendVoid(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'inventory',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: saleId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:sales',
      'inventory:sale-detail',
    ]);
  }

  Future<({List<InventoryAuditLogEntry> data, int count})> getAuditLogs(
    String wsId, {
    int limit = 20,
    int offset = 0,
    bool forceRefresh = false,
  }) => _getAuditLogs(
    wsId,
    limit: limit,
    offset: offset,
    forceRefresh: forceRefresh,
  );

  Future<InventoryCheckoutDefaults> getCheckoutDefaults(String wsId) =>
      _getCheckoutDefaults(wsId);

  Future<List<InventorySalesPeriod>> getCheckoutSalesPeriods(String wsId) =>
      _getCheckoutSalesPeriods(wsId);

  Future<InventorySeasonQuote> getSeasonQuote(String wsId, String periodId) =>
      _getSeasonQuote(wsId, periodId);

  Future<String?> getSaleReceipt(String wsId, String requestId) =>
      _getSaleReceipt(wsId, requestId);

  Future<String> sendScheduledSale(String wsId, Map<String, dynamic> payload) =>
      _sendScheduledSale(wsId, payload);

  Future<String> createSale({
    required String wsId,
    required String walletId,
    required List<Map<String, dynamic>> products,
    String? content,
    String? notes,
    String? categoryId,
    String? periodId,
  }) => _createLegacySale(
    wsId: wsId,
    walletId: walletId,
    products: products,
    content: content,
    notes: notes,
    categoryId: categoryId,
    periodId: periodId,
  );

  void dispose() => _api.dispose();
}
