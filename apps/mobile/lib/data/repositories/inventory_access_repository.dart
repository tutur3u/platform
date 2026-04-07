import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

class InventoryAccessRepository {
  InventoryAccessRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<bool> isInventoryEnabled(String wsId) async {
    final response = await _api.getJson(InventoryEndpoints.access(wsId));
    return response['enabled'] == true;
  }
}
