import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/sources/api_client.dart';

part 'inventory_repository_cache.dart';

class InventoryRepository {
  InventoryRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;

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
  }) {
    return _cachedInventoryMap(
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
  }

  Future<InventoryProduct?> getProduct(
    String wsId,
    String productId, {
    bool forceRefresh = false,
  }) {
    return _cachedInventoryMap(
      namespace: 'product',
      wsId: wsId,
      forceRefresh: forceRefresh,
      tags: const ['inventory:catalog'],
      params: {'productId': productId},
      fetch: () => _api.getJson(
        InventoryEndpoints.product(wsId, productId),
      ),
      decode: InventoryProduct.fromJson,
    );
  }

  Future<void> createProduct({
    required String wsId,
    required String name,
    required String categoryId,
    required String ownerId,
    required List<InventoryStockEntry> inventory,
    String? manufacturerId,
    String? description,
    String? usage,
    String? financeCategoryId,
  }) async {
    await _api.postJson(
      InventoryEndpoints.createProduct(wsId),
      _buildProductPayload(
        name: name,
        categoryId: categoryId,
        ownerId: ownerId,
        inventory: inventory,
        manufacturerId: manufacturerId,
        description: description,
        usage: usage,
        financeCategoryId: financeCategoryId,
      ),
    );
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:catalog',
    ]);
  }

  Future<void> updateProduct({
    required String wsId,
    required String productId,
    required String name,
    required String categoryId,
    required String ownerId,
    required List<InventoryStockEntry> inventory,
    String? manufacturerId,
    String? description,
    String? usage,
    String? financeCategoryId,
  }) async {
    await _api.patchJson(
      InventoryEndpoints.product(wsId, productId),
      _buildProductPayload(
        name: name,
        categoryId: categoryId,
        ownerId: ownerId,
        inventory: inventory,
        manufacturerId: manufacturerId,
        description: description,
        usage: usage,
        financeCategoryId: financeCategoryId,
      ),
    );
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:catalog',
    ]);
  }

  Future<List<InventoryProduct>> getProductOptions(
    String wsId, {
    bool forceRefresh = false,
  }) {
    return _cachedInventoryMap(
      namespace: 'product-options',
      wsId: wsId,
      forceRefresh: forceRefresh,
      policy: CachePolicies.metadata,
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
  }) {
    return _cachedInventoryMap(
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
    );
  }

  Future<void> createOwner(String wsId, String name) async {
    await _api.postJson(InventoryEndpoints.owners(wsId), {'name': name});
    await _invalidateInventory(wsId, const [
      'inventory:setup',
      'inventory:catalog',
    ]);
  }

  Future<List<InventoryLookupItem>> getManufacturers(
    String wsId, {
    bool forceRefresh = false,
  }) {
    return _cachedInventoryMap(
      namespace: 'manufacturers',
      wsId: wsId,
      forceRefresh: forceRefresh,
      policy: CachePolicies.metadata,
      tags: const ['inventory:setup'],
      fetch: () => _api.getJson(InventoryEndpoints.manufacturers(wsId)),
      decode: _decodeLookupMap,
    );
  }

  Future<void> createManufacturer(String wsId, String name) async {
    await _api.postJson(InventoryEndpoints.manufacturers(wsId), {'name': name});
    await _invalidateInventory(wsId, const ['inventory:setup']);
  }

  Future<List<InventoryLookupItem>> getProductCategories(
    String wsId, {
    bool forceRefresh = false,
  }) {
    return _cachedInventoryList(
      namespace: 'product-categories',
      wsId: wsId,
      forceRefresh: forceRefresh,
      tags: const ['inventory:setup'],
      fetch: () => _api.getJsonList(
        InventoryEndpoints.productCategories(wsId),
      ),
      decode: _decodeLookupList,
    );
  }

  Future<void> createProductCategory(String wsId, String name) async {
    await _api.postJson(InventoryEndpoints.productCategories(wsId), {
      'name': name,
    });
    await _invalidateInventory(wsId, const [
      'inventory:setup',
      'inventory:catalog',
    ]);
  }

  Future<List<InventoryLookupItem>> getProductUnits(
    String wsId, {
    bool forceRefresh = false,
  }) {
    return _cachedInventoryList(
      namespace: 'product-units',
      wsId: wsId,
      forceRefresh: forceRefresh,
      tags: const ['inventory:setup'],
      fetch: () => _api.getJsonList(InventoryEndpoints.productUnits(wsId)),
      decode: _decodeLookupList,
    );
  }

  Future<void> createProductUnit(String wsId, String name) async {
    await _api.postJson(InventoryEndpoints.productUnits(wsId), {'name': name});
    await _invalidateInventory(wsId, const ['inventory:setup']);
  }

  Future<List<InventoryLookupItem>> getProductWarehouses(
    String wsId, {
    bool forceRefresh = false,
  }) {
    return _cachedInventoryList(
      namespace: 'product-warehouses',
      wsId: wsId,
      forceRefresh: forceRefresh,
      tags: const ['inventory:setup'],
      fetch: () => _api.getJsonList(
        InventoryEndpoints.productWarehouses(wsId),
      ),
      decode: _decodeLookupList,
    );
  }

  Future<void> createProductWarehouse(String wsId, String name) async {
    await _api.postJson(InventoryEndpoints.productWarehouses(wsId), {
      'name': name,
    });
    await _invalidateInventory(wsId, const ['inventory:setup']);
  }

  Future<({List<InventorySaleSummary> data, int count, bool realtimeEnabled})>
  getSales(
    String wsId, {
    int limit = 20,
    int offset = 0,
    String? periodId,
    bool forceRefresh = false,
  }) {
    return _cachedInventoryMap(
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
  }

  Future<List<InventorySalesPeriod>> getSalesPeriods(
    String wsId, {
    bool includeArchived = true,
    bool forceRefresh = false,
  }) {
    return _cachedInventoryMap(
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
    );
  }

  Future<InventorySalesPeriod> createSalesPeriod({
    required String wsId,
    required String name,
    String? description,
    DateTime? startsAt,
    DateTime? endsAt,
    String productScope = 'all',
    List<String> productIds = const [],
  }) async {
    final response = await _api.postJson(
      InventoryEndpoints.salesPeriods(wsId),
      {
        'name': name,
        'description': description,
        'starts_at': _dateOnly(startsAt),
        'ends_at': _dateOnly(endsAt),
        'product_scope': productScope,
        'product_ids': productScope == 'all' ? <String>[] : productIds,
      },
    );
    final period = InventorySalesPeriod.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
    await _invalidateInventory(wsId, const [
      'inventory:periods',
      'inventory:sales',
    ]);
    return period;
  }

  Future<InventorySalesPeriod> updateSalesPeriod({
    required String wsId,
    required String periodId,
    String? name,
    String? description,
    DateTime? startsAt,
    DateTime? endsAt,
    String? productScope,
    List<String>? productIds,
    String? status,
  }) async {
    final isContentUpdate = name != null;
    final response = await _api.patchJson(
      InventoryEndpoints.salesPeriod(wsId, periodId),
      {
        if (name != null) 'name': name,
        if (isContentUpdate) 'description': description,
        if (isContentUpdate) 'starts_at': _dateOnly(startsAt),
        if (isContentUpdate) 'ends_at': _dateOnly(endsAt),
        if (productScope != null) 'product_scope': productScope,
        if (productIds != null) 'product_ids': productIds,
        if (status != null) 'status': status,
      },
    );
    final period = InventorySalesPeriod.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
    await _invalidateInventory(wsId, const [
      'inventory:periods',
      'inventory:sales',
    ]);
    return period;
  }

  Future<InventorySalesPeriod?> setSalePeriod({
    required String wsId,
    required String saleId,
    required String source,
    required String? periodId,
  }) async {
    final response = await _api.putJson(
      InventoryEndpoints.salePeriod(wsId, saleId),
      {'period_id': periodId, 'source': source},
    );
    final data = response['data'];
    final period = data is Map
        ? InventorySalesPeriod.fromJson(Map<String, dynamic>.from(data))
        : null;
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
  }) async {
    final response = await _api.putJson(InventoryEndpoints.sale(wsId, saleId), {
      'notice': notice,
      'note': note,
      'wallet_id': walletId,
      'category_id': categoryId,
      if (products != null) 'products': products,
    });
    final sale = InventorySaleDetail.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:sales',
      'inventory:sale-detail',
    ]);
    return sale;
  }

  Future<void> deleteSale(String wsId, String saleId) async {
    await _api.deleteJson(InventoryEndpoints.sale(wsId, saleId));
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

  Future<String> createSale({
    required String wsId,
    required String walletId,
    required List<Map<String, dynamic>> products,
    String? content,
    String? notes,
    String? categoryId,
    String? periodId,
  }) async {
    final response = await _api.postJson(InventoryEndpoints.invoices(wsId), {
      'customer_id': null,
      'content': content ?? 'Mobile inventory sale',
      'notes': notes,
      'wallet_id': walletId,
      'category_id': categoryId,
      'products': products,
    });

    final invoiceId = response['invoice_id'] as String;
    if (periodId != null && periodId.isNotEmpty) {
      await setSalePeriod(
        wsId: wsId,
        saleId: invoiceId,
        source: 'finance_invoice',
        periodId: periodId,
      );
    }
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:sales',
      'inventory:audit',
    ]);
    return invoiceId;
  }

  void dispose() => _api.dispose();
}

String? _dateOnly(DateTime? value) {
  if (value == null) return null;
  final month = value.month.toString().padLeft(2, '0');
  final day = value.day.toString().padLeft(2, '0');
  return '${value.year}-$month-$day';
}
