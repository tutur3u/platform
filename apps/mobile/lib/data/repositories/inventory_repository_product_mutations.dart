part of 'inventory_repository.dart';

extension InventoryProductMutations on InventoryRepository {
  Map<String, dynamic> _buildProductPayload({
    required String name,
    required String categoryId,
    required String ownerId,
    required List<InventoryStockEntry> inventory,
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
    required List<InventoryStockEntry> inventory,
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
}
