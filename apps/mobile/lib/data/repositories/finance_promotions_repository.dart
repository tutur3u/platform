import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/data/models/finance/finance_promotion.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Promotion endpoint paths, served by the Finance origin, which forwards
/// writes to Inventory.
abstract final class FinancePromotionEndpoints {
  static String promotions(String wsId) =>
      '/api/v1/workspaces/$wsId/promotions';
  static String promotion(String wsId, String id) =>
      '/api/v1/workspaces/$wsId/promotions/$id';
}

/// Invoice promotions. Reads go through the offline cache; writes need a
/// connection because Inventory validates codes and usage limits.
class FinancePromotionsRepository {
  FinancePromotionsRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<List<FinancePromotion>> list(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final rows = await readThroughJsonList(
      api: _api,
      namespace: 'finance.promotions',
      workspaceId: wsId,
      path: FinancePromotionEndpoints.promotions(wsId),
      forceRefresh: forceRefresh,
    );
    return rows
        .whereType<Map<String, dynamic>>()
        .map(FinancePromotion.fromJson)
        .toList(growable: false);
  }

  Future<void> create(String wsId, FinancePromotion promotion) => _api.postJson(
    FinancePromotionEndpoints.promotions(wsId),
    promotion.toPayload(),
  );

  Future<void> update(String wsId, FinancePromotion promotion) => _api.putJson(
    FinancePromotionEndpoints.promotion(wsId, promotion.id),
    promotion.toPayload(),
  );

  Future<void> delete(String wsId, String id) =>
      _api.deleteJson(FinancePromotionEndpoints.promotion(wsId, id));
}
