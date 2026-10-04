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

  Future<CacheReadResult<bool>> readCachedInventoryAccess(String wsId) async {
    final actor = currentCacheUserId();
    if (actor == null) {
      return const CacheReadResult<bool>(state: CacheEntryState.missing);
    }
    final result = await CacheStore.instance.read<bool>(
      key: _cacheKey(wsId),
      decode: _decodeEnabled,
    );
    return currentCacheUserId() == actor
        ? result
        : const CacheReadResult<bool>(state: CacheEntryState.missing);
  }

  Future<bool> isInventoryEnabled(String wsId) async {
    final actor = currentCacheUserId();
    if (actor == null) return false;
    final result = await CacheStore.instance.prefetch<bool>(
      key: _cacheKey(wsId),
      policy: _cachePolicy,
      decode: _decodeEnabled,
      fetch: () async {
        final data = await _api.getJson(InventoryEndpoints.access(wsId));
        if (currentCacheUserId() != actor) {
          throw Exception('Inventory actor changed.');
        }
        return data;
      },
      tags: const [_cacheTag],
    );
    return currentCacheUserId() == actor && (result.data ?? false);
  }
}
