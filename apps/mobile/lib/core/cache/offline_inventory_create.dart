import 'package:mobile/data/sources/api_client.dart';

const inventoryOfflineCreateContract = 'inventory-offline-create-v1';

/// One explicit endpoint is the only create path. Unknown old-server routes
/// cannot apply effects and become retryable capability gaps, never fallback.
Future<Map<String, dynamic>> sendOfflineInventoryCreate({
  required ApiClient api,
  required String workspaceId,
  required String operationId,
  required String kind,
  required Map<String, dynamic> payload,
}) async {
  Map<String, dynamic> response;
  try {
    response = await api.postJson(
      '/api/v1/workspaces/$workspaceId/inventory/offline-mutations',
      {'operation_id': operationId, 'kind': kind, 'payload': payload},
    );
  } on ApiException catch (error) {
    if (error.statusCode == 404 && !error.offlineContractObserved) {
      throw const ApiException(
        message: 'Offline contract is not available yet',
        statusCode: 503,
        code: 'OFFLINE_CONTRACT_UNAVAILABLE',
      );
    }
    rethrow;
  }
  final data = response['data'];
  final id = data is Map ? data['id'] : null;
  if (response['contract'] != inventoryOfflineCreateContract ||
      response['resource'] != kind ||
      id is! String ||
      !RegExp(
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
        r'[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
      ).hasMatch(id)) {
    throw const ApiException(
      message: 'Offline contract response is unavailable',
      statusCode: 503,
      code: 'OFFLINE_CONTRACT_UNAVAILABLE',
    );
  }
  return response;
}
