import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

class InventoryAccessRepository {
  InventoryAccessRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  static const CachePolicy _cachePolicy = CachePolicies.metadata;
  static const _cacheTag = 'inventory:access';

  final ApiClient _api;

  CacheKey _cacheKey(String wsId) {
    return CacheKey(
      namespace: 'inventory.access',
      userId: currentCacheUserId(),
      workspaceId: wsId,
    );
  }

  bool _decodeEnabled(Object? json) {
    if (json is! Map<String, dynamic>) {
      throw FormatException(
        'Invalid inventory access payload: expected object. Response: $json',
      );
    }

    if (!json.containsKey('enabled')) {
      throw FormatException(
        'Invalid inventory access payload: '
        'missing "enabled" key. Response: $json',
      );
    }

    final enabled = json['enabled'];
    if (enabled is bool) {
      return enabled;
    }

    throw FormatException(
      'Invalid inventory access payload: '
      '"enabled" must be a bool. Response: $json',
    );
  }

  Future<CacheReadResult<bool>> readCachedInventoryAccess(String wsId) {
    return CacheStore.instance.read<bool>(
      key: _cacheKey(wsId),
      decode: _decodeEnabled,
    );
  }

  Future<void> _saveCachedInventoryAccess(String wsId, bool enabled) {
    return CacheStore.instance.write(
      key: _cacheKey(wsId),
      policy: _cachePolicy,
      payload: {'enabled': enabled},
      tags: const [_cacheTag],
    );
  }

  Future<bool> isInventoryEnabled(String wsId) async {
    final response = await _api.getJson(InventoryEndpoints.access(wsId));
    final enabled = _decodeEnabled(response);
    await _saveCachedInventoryAccess(wsId, enabled);
    return enabled;
  }
}
