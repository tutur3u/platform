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

  /// The stored stock rows with every column, read fresh from the server.
  Future<List<InventoryStockRow>> getProductStockRows(
    String wsId,
    String productId,
  ) async {
    final response = await _api.getJson(
      InventoryEndpoints.productInventory(wsId, productId),
    );
    return (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(InventoryStockRow.fromJson)
        .toList(growable: false);
  }

  /// Replaces a product's stock rows through the stock endpoint, which
  /// records each change in stock history.
  ///
  /// Runs online only: the endpoint takes the desired rows, so a queued
  /// replay could overwrite sales made in the meantime. Before writing, the
  /// stored rows are re-read and compared with [baseline] (the rows the
  /// editor started from) on every column; any difference throws
  /// [InventoryStockConflict] with the latest rows instead of overwriting
  /// them. Each row keeps its stored revenue share; the endpoint would
  /// otherwise reset it.
  Future<void> adjustProductStock({
    required String wsId,
    required String productId,
    required List<InventoryStockRow> baseline,
    required List<InventoryStockEntry> inventory,
  }) async {
    if (!await _networkAvailable()) throw const InventoryStockOffline();
    try {
      final latest = await getProductStockRows(wsId, productId);
      if (!inventoryStockRowsMatch(latest, baseline)) {
        throw InventoryStockConflict(latest);
      }
      final stored = {for (final row in latest) row.key: row};
      await _api.patchJson(
        InventoryEndpoints.productInventory(wsId, productId),
        {
          'inventory': [
            for (final row in inventory)
              {
                ..._stockPayload([row]).single,
                'revenue_share_partner_id':
                    stored['${row.warehouseId}:${row.unitId}']
                        ?.revenueSharePartnerId,
                'revenue_share_bps':
                    stored['${row.warehouseId}:${row.unitId}']
                        ?.revenueShareBps ??
                    0,
              },
          ],
        },
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

/// Stock adjustment needs a connection.
class InventoryStockOffline implements Exception {
  const InventoryStockOffline();
}

/// Stock changed on the server after the editor loaded it.
class InventoryStockConflict implements Exception {
  const InventoryStockConflict(this.latest);

  final List<InventoryStockRow> latest;
}
