part of 'inventory_repository.dart';

extension _InventoryProductDetailReads on InventoryRepository {
  /// Online read: stock movements are not part of the offline replica.
  Future<InventoryStockHistoryPage> _getProductStockHistory(
    String wsId,
    String productId, {
    int offset = 0,
  }) async {
    final path = InventoryEndpoints.productStockHistory(wsId, productId);
    final response = await _api.getJson('$path?limit=25&offset=$offset');
    return InventoryStockHistoryPage.fromJson(response);
  }
}
