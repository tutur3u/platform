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
    String? manufacturer,
    String? description,
    String? usage,
    String? financeCategoryId,
  }) {
    return {
      'name': name,
      'category_id': categoryId,
      'owner_id': ownerId,
      if (manufacturer != null) 'manufacturer': manufacturer,
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
      'manufacturer': json['manufacturer'],
      'description': json['description'],
      'usage': json['usage'],
      'category': null,
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
  }) async {
    final response = await _api.getJson(
      InventoryEndpoints.products(
        wsId,
        query: query,
        status: status,
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
    String? manufacturer,
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
        manufacturer: manufacturer,
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
    String? manufacturer,
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
        manufacturer: manufacturer,
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
    await _api.postJson(InventoryEndpoints.owners(wsId), {
      'name': name,
    });
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
    await _api.postJson(InventoryEndpoints.productUnits(wsId), {
      'name': name,
    });
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
  getSales(String wsId) async {
    final response = await _api.getJson(InventoryEndpoints.sales(wsId));
    return (
      data: (response['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(InventorySaleSummary.fromJson)
          .toList(growable: false),
      count: (response['count'] as num?)?.toInt() ?? 0,
      realtimeEnabled: response['realtime_enabled'] as bool? ?? false,
    );
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
  }) async {
    final response = await _api.putJson(InventoryEndpoints.sale(wsId, saleId), {
      'notice': notice,
      'note': note,
      'wallet_id': walletId,
      'category_id': categoryId,
    });
    return InventorySaleDetail.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
  }

  Future<void> deleteSale(String wsId, String saleId) async {
    await _api.deleteJson(InventoryEndpoints.sale(wsId, saleId));
  }

  Future<({List<InventoryAuditLogEntry> data, int count})> getAuditLogs(
    String wsId,
  ) async {
    final response = await _api.getJson(InventoryEndpoints.auditLogs(wsId));
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
  }) async {
    final response = await _api.postJson(InventoryEndpoints.invoices(wsId), {
      'customer_id': null,
      'content': content ?? 'Mobile inventory sale',
      'notes': notes,
      'wallet_id': walletId,
      'category_id': categoryId,
      'products': products,
    });

    return response['invoice_id'] as String;
  }
}
