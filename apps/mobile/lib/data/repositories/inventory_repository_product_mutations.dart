part of 'inventory_repository.dart';

extension InventoryProductMutations on InventoryRepository {
  Map<String, dynamic> _buildProductPayload({
    required String name,
    required String categoryId,
    required String ownerId,
    required List<InventoryStockEntry>? inventory,
    String? manufacturerId,
    String? description,
    String? usage,
    String? financeCategoryId,
    String? avatarUrl,
  }) {
    return {
      'name': name,
      'category_id': categoryId,
      'owner_id': ownerId,
      'manufacturer_id': manufacturerId,
      if (description != null) 'description': description,
      if (usage != null) 'usage': usage,
      if (financeCategoryId != null) 'finance_category_id': financeCategoryId,
      if (avatarUrl != null) 'avatar_url': avatarUrl.isEmpty ? null : avatarUrl,
      if (inventory != null) 'inventory': _stockPayload(inventory),
    };
  }

  Future<void> deleteProduct({
    required String wsId,
    required String productId,
  }) async {
    final path = InventoryEndpoints.product(wsId, productId);
    await queueOrSendVoid(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'inventory',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: productId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:catalog',
    ]);
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
    String? avatarUrl,
  }) async {
    final path = InventoryEndpoints.createProduct(wsId);
    final payload = _buildProductPayload(
      name: name,
      categoryId: categoryId,
      ownerId: ownerId,
      inventory: inventory,
      manufacturerId: manufacturerId,
      description: description,
      usage: usage,
      financeCategoryId: financeCategoryId,
      avatarUrl: avatarUrl,
    );
    await queueOrSendVoid(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'inventory',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      send: () async {
        throw StateError('Inventory create uses durable replay');
      },
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

    /// Null leaves stock untouched; stock changes go through
    /// [adjustProductStock] so they are recorded in stock history.
    List<InventoryStockEntry>? inventory,
    String? manufacturerId,
    String? description,
    String? usage,
    String? financeCategoryId,
    String? avatarUrl,
  }) async {
    final path = InventoryEndpoints.product(wsId, productId);
    final payload = _buildProductPayload(
      name: name,
      categoryId: categoryId,
      ownerId: ownerId,
      inventory: inventory,
      manufacturerId: manufacturerId,
      description: description,
      usage: usage,
      financeCategoryId: financeCategoryId,
      avatarUrl: avatarUrl,
    );
    await queueOrSendVoid(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'inventory',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: productId,
      send: () async {
        throw StateError('Inventory edit uses durable replay');
      },
    );
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:catalog',
    ]);
  }

  /// Replaces a product's stock rows through the stock endpoint, which
  /// records each change in stock history.
  ///
  /// Runs online only: the endpoint takes the desired rows, so a queued
  /// replay could overwrite sales made in the meantime. Before writing, the
  /// current rows are re-read and compared with [baseline] (the rows the
  /// editor started from); any difference throws [InventoryStockConflict]
  /// with the latest product instead of overwriting it.
  Future<void> adjustProductStock({
    required String wsId,
    required String productId,
    required List<InventoryStockEntry> baseline,
    required List<InventoryStockEntry> inventory,
  }) async {
    if (!await _networkAvailable()) throw const InventoryStockOffline();
    final InventoryProduct? latest;
    try {
      latest = await getProduct(wsId, productId, forceRefresh: true);
    } on ApiException catch (error) {
      if (isOfflineTransportFailure(error)) {
        throw const InventoryStockOffline();
      }
      rethrow;
    }
    if (latest == null) {
      throw const ApiException(message: 'Product not found', statusCode: 404);
    }
    if (!inventoryStockRowsEqual(latest.inventory, baseline)) {
      throw InventoryStockConflict(latest);
    }
    try {
      await _api.patchJson(
        InventoryEndpoints.productInventory(wsId, productId),
        {'inventory': _stockPayload(inventory)},
      );
    } on ApiException catch (error) {
      if (isOfflineTransportFailure(error)) {
        throw const InventoryStockOffline();
      }
      rethrow;
    }
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:catalog',
    ]);
  }

  List<Map<String, dynamic>> _stockPayload(List<InventoryStockEntry> rows) =>
      rows
          .map(
            (row) => {
              'unit_id': row.unitId,
              'warehouse_id': row.warehouseId,
              'amount': row.amount,
              'min_amount': row.minAmount,
              'price': row.price,
            },
          )
          .toList(growable: false);
}

/// Whether two stock row lists hold the same quantities, minimums and
/// prices per warehouse and unit, in any order.
bool inventoryStockRowsEqual(
  List<InventoryStockEntry> a,
  List<InventoryStockEntry> b,
) {
  if (a.length != b.length) return false;
  String key(InventoryStockEntry row) => '${row.warehouseId}:${row.unitId}';
  final rows = {for (final row in a) key(row): row};
  for (final row in b) {
    final other = rows[key(row)];
    if (other == null ||
        other.amount != row.amount ||
        other.minAmount != row.minAmount ||
        other.price != row.price) {
      return false;
    }
  }
  return true;
}

/// Stock adjustment needs a connection.
class InventoryStockOffline implements Exception {
  const InventoryStockOffline();
}

/// Stock changed on the server after the editor loaded it.
class InventoryStockConflict implements Exception {
  const InventoryStockConflict(this.latest);

  final InventoryProduct latest;
}
