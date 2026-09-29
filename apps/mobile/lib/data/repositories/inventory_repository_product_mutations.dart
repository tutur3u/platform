part of 'inventory_repository.dart';

extension InventoryProductMutations on InventoryRepository {
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
    );
    final id = newLocalMutationId();
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'inventory',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: id,
    )) {
      return;
    }
    try {
      await _api.postJson(path, payload);
    } on ApiException catch (error) {
      if (!await OfflineMutationQueue.instance.enqueueAfterNetworkFailure(
        error: error,
        feature: 'inventory',
        method: 'POST',
        path: path,
        workspaceId: wsId,
        payload: payload,
        entityId: id,
        replaySafe: false,
      )) {
        rethrow;
      }
    }
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
    );
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'inventory',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: productId,
    )) {
      return;
    }
    try {
      await _api.patchJson(path, payload);
    } on ApiException catch (error) {
      if (!await OfflineMutationQueue.instance.enqueueAfterNetworkFailure(
        error: error,
        feature: 'inventory',
        method: 'PATCH',
        path: path,
        workspaceId: wsId,
        payload: payload,
        entityId: productId,
        replaySafe: false,
      )) {
        rethrow;
      }
    }
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:catalog',
    ]);
  }
}
