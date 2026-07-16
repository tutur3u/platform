import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/sources/api_client.dart';

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

  Future<InventoryOverview> getOverview(String wsId) async {
    final response = await _api.getJson(InventoryEndpoints.overview(wsId));
    return InventoryOverview.fromJson(response);
  }

  Future<({List<InventoryProduct> data, int count})> getProducts(
    String wsId, {
    String? query,
    String status = 'active',
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _api.getJson(
      InventoryEndpoints.products(
        wsId,
        query: query,
        status: status,
        page: page,
        pageSize: pageSize,
      ),
    );

    return (
      data: (response['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(InventoryProduct.fromJson)
          .toList(growable: false),
      count: (response['count'] as num?)?.toInt() ?? 0,
    );
  }

  Future<InventoryProduct?> getProduct(String wsId, String productId) async {
    final response = await _api.getJson(
      InventoryEndpoints.product(wsId, productId),
    );
    return InventoryProduct.fromJson(response);
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
  }

  Future<List<InventoryProduct>> getProductOptions(String wsId) async {
    final response = await _api.getJson(
      InventoryEndpoints.productOptions(wsId),
    );
    return (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(_normalizeOptionProduct)
        .map(InventoryProduct.fromJson)
        .toList(growable: false);
  }

  Future<List<InventoryOwner>> getOwners(String wsId) async {
    final response = await _api.getJson(InventoryEndpoints.owners(wsId));
    return (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(InventoryOwner.fromJson)
        .toList(growable: false);
  }

  Future<void> createOwner(String wsId, String name) async {
    await _api.postJson(InventoryEndpoints.owners(wsId), {'name': name});
  }

  Future<List<InventoryLookupItem>> getManufacturers(String wsId) async {
    final response = await _api.getJson(InventoryEndpoints.manufacturers(wsId));
    return (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(InventoryLookupItem.fromJson)
        .toList(growable: false);
  }

  Future<void> createManufacturer(String wsId, String name) async {
    await _api.postJson(InventoryEndpoints.manufacturers(wsId), {'name': name});
  }

  Future<List<InventoryLookupItem>> getProductCategories(String wsId) async {
    final response = await _api.getJsonList(
      InventoryEndpoints.productCategories(wsId),
    );
    return response
        .whereType<Map<String, dynamic>>()
        .map(InventoryLookupItem.fromJson)
        .toList(growable: false);
  }

  Future<void> createProductCategory(String wsId, String name) async {
    await _api.postJson(InventoryEndpoints.productCategories(wsId), {
      'name': name,
    });
  }

  Future<List<InventoryLookupItem>> getProductUnits(String wsId) async {
    final response = await _api.getJsonList(
      InventoryEndpoints.productUnits(wsId),
    );
    return response
        .whereType<Map<String, dynamic>>()
        .map(InventoryLookupItem.fromJson)
        .toList(growable: false);
  }

  Future<void> createProductUnit(String wsId, String name) async {
    await _api.postJson(InventoryEndpoints.productUnits(wsId), {'name': name});
  }

  Future<List<InventoryLookupItem>> getProductWarehouses(String wsId) async {
    final response = await _api.getJsonList(
      InventoryEndpoints.productWarehouses(wsId),
    );
    return response
        .whereType<Map<String, dynamic>>()
        .map(InventoryLookupItem.fromJson)
        .toList(growable: false);
  }

  Future<void> createProductWarehouse(String wsId, String name) async {
    await _api.postJson(InventoryEndpoints.productWarehouses(wsId), {
      'name': name,
    });
  }

  Future<({List<InventorySaleSummary> data, int count, bool realtimeEnabled})>
  getSales(
    String wsId, {
    int limit = 20,
    int offset = 0,
    String? periodId,
  }) async {
    final response = await _api.getJson(
      InventoryEndpoints.sales(
        wsId,
        limit: limit,
        offset: offset,
        periodId: periodId,
      ),
    );
    return (
      data: (response['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(InventorySaleSummary.fromJson)
          .toList(growable: false),
      count: (response['count'] as num?)?.toInt() ?? 0,
      realtimeEnabled: response['realtime_enabled'] as bool? ?? false,
    );
  }

  Future<List<InventorySalesPeriod>> getSalesPeriods(
    String wsId, {
    bool includeArchived = true,
  }) async {
    final response = await _api.getJson(
      InventoryEndpoints.salesPeriods(
        wsId,
        includeArchived: includeArchived,
      ),
    );
    return (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(InventorySalesPeriod.fromJson)
        .toList(growable: false);
  }

  Future<InventorySalesPeriod> createSalesPeriod({
    required String wsId,
    required String name,
    String? description,
    DateTime? startsAt,
    DateTime? endsAt,
  }) async {
    final response = await _api.postJson(
      InventoryEndpoints.salesPeriods(wsId),
      {
        'name': name,
        'description': description,
        'starts_at': _dateOnly(startsAt),
        'ends_at': _dateOnly(endsAt),
      },
    );
    return InventorySalesPeriod.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
  }

  Future<InventorySalesPeriod> updateSalesPeriod({
    required String wsId,
    required String periodId,
    String? name,
    String? description,
    DateTime? startsAt,
    DateTime? endsAt,
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
        if (status != null) 'status': status,
      },
    );
    return InventorySalesPeriod.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
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
    return data is Map
        ? InventorySalesPeriod.fromJson(Map<String, dynamic>.from(data))
        : null;
  }

  Future<InventorySaleDetail> getSaleDetail(String wsId, String saleId) async {
    final response = await _api.getJson(InventoryEndpoints.sale(wsId, saleId));
    return InventorySaleDetail.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
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
    return InventorySaleDetail.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
  }

  Future<void> deleteSale(String wsId, String saleId) async {
    await _api.deleteJson(InventoryEndpoints.sale(wsId, saleId));
  }

  Future<({List<InventoryAuditLogEntry> data, int count})> getAuditLogs(
    String wsId, {
    int limit = 20,
    int offset = 0,
  }) async {
    final response = await _api.getJson(
      InventoryEndpoints.auditLogs(wsId, limit: limit, offset: offset),
    );
    return (
      data: (response['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(InventoryAuditLogEntry.fromJson)
          .toList(growable: false),
      count: (response['count'] as num?)?.toInt() ?? 0,
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
