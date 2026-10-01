import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/inventory/inventory_season_price.dart';
import 'package:mobile/data/models/inventory/inventory_stock_health.dart';
import 'package:mobile/data/repositories/inventory_pending_overlay.dart';
import 'package:mobile/data/sources/api_client.dart';

part 'inventory_repository_cache.dart';
part 'inventory_repository_product_mutations.dart';
part 'inventory_repository_sales_pending.dart';
part 'inventory_repository_sales_period_mutations.dart';
part 'inventory_repository_season_pricing.dart';
part 'inventory_repository_setup_pending.dart';

class InventoryRepository {
  InventoryRepository({ApiClient? apiClient, CacheStore? cacheStore})
    : _api = apiClient ?? ApiClient(),
      _cacheStore = cacheStore ?? CacheStore.instance;

  final ApiClient _api;
  final CacheStore _cacheStore;

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

  Map<String, dynamic> _normalizeOptionProduct(Map<String, dynamic> json) {
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
      'ws_id': '',
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

  /// Reads confirmed server counts without a persistent aggregate cache.
  Future<InventoryStockHealth> getStockHealth(String wsId) async {
    final response = await _api.getJson(
      InventoryEndpoints.analyticsSummary(wsId),
    );
    return InventoryStockHealth.fromJson(response);
  }

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
  }) async {
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
    final data = overlayPendingProducts(
      wsId,
      result.data,
      await OfflineMutationQueue.instance.listPending(),
      query: query?.trim(),
      includeCreates: page == 1 && status == 'active',
    );
    return (data: data, count: result.count + data.length - result.data.length);
  }

  Future<InventoryProduct?> getProduct(
    String wsId,
    String productId, {
    bool forceRefresh = false,
  }) async {
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
      if (error.statusCode != 0) rethrow;
      offlineError = error;
    }
    final rows = overlayPendingProducts(wsId, [
      if (product != null) product,
    ], await OfflineMutationQueue.instance.listPending());
    for (final row in rows) {
      if (row.id == productId) return row;
    }
    if (offlineError != null) throw offlineError;
    return product;
  }

  Future<List<InventoryProduct>> getProductOptions(
    String wsId, {
    bool forceRefresh = false,
  }) {
    return _cachedInventoryMap(
      namespace: 'product-options',
      wsId: wsId,
      forceRefresh: forceRefresh,
      policy: CachePolicies.offlineCatalog,
      tags: const ['inventory:catalog'],
      fetch: () => _api.getJson(InventoryEndpoints.productOptions(wsId)),
      decode: (response) =>
          (response['data'] as List<dynamic>? ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(_normalizeOptionProduct)
              .map(InventoryProduct.fromJson)
              .toList(growable: false),
    );
  }

  Future<List<InventoryOwner>> getOwners(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final owners = await _setupRows(
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
    } on ApiException catch (error) {
      if (error.statusCode != 0) rethrow;
      return _overlayPendingInventorySales(
        wsId,
        (data: const [], count: 0, realtimeEnabled: false),
        periodId: periodId,
        includeCreates: offset == 0,
      );
    }
    return _overlayPendingInventorySales(
      wsId,
      result,
      periodId: periodId,
      includeCreates: offset == 0,
    );
  }

  Future<List<InventorySalesPeriod>> getSalesPeriods(
    String wsId, {
    bool includeArchived = true,
    bool forceRefresh = false,
  }) async {
    final periods = await _setupRows(
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
      feature: 'inventory',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      entityId: saleId,
      payload: payload,
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
  }) {
    return _cachedInventoryMap(
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
  }

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
      feature: 'inventory',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      entityId: saleId,
      payload: payload,
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
  }) {
    return _cachedInventoryMap(
      namespace: 'audit-logs',
      wsId: wsId,
      forceRefresh: forceRefresh,
      tags: const ['inventory:audit'],
      params: {'limit': '$limit', 'offset': '$offset'},
      fetch: () => _api.getJson(
        InventoryEndpoints.auditLogs(wsId, limit: limit, offset: offset),
      ),
      decode: (response) => (
        data: (response['data'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(InventoryAuditLogEntry.fromJson)
            .toList(growable: false),
        count: (response['count'] as num?)?.toInt() ?? 0,
      ),
    );
  }

  Future<List<InventorySalesPeriod>> getCheckoutSalesPeriods(String wsId) =>
      _getCheckoutSalesPeriods(wsId);

  Future<InventorySeasonQuote> getSeasonQuote(String wsId, String periodId) =>
      _getSeasonQuote(wsId, periodId);

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
