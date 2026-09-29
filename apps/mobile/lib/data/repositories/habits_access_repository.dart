import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

class HabitsAccessRepository {
  HabitsAccessRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  static const CachePolicy _cachePolicy = CachePolicies.metadata;
  static const _cacheTag = 'habits:access';

  final ApiClient _api;

  CacheKey _cacheKey(String wsId) {
    return CacheKey(
      namespace: 'habits.access',
      userId: currentCacheUserId(),
      workspaceId: wsId,
    );
  }

  bool _decodeEnabled(Object? json) {
    if (json is! Map<String, dynamic>) {
      throw FormatException(
        'Invalid habits access payload: expected object. Response: $json',
      );
    }

    if (!json.containsKey('enabled')) {
      throw FormatException(
        'Invalid habits access payload: '
        'missing "enabled" key. Response: $json',
      );
    }

    final enabled = json['enabled'];
    if (enabled is bool) {
      return enabled;
    }

    throw FormatException(
      'Invalid habits access payload: '
      '"enabled" must be a bool. Response: $json',
    );
  }

  Future<CacheReadResult<bool>> readCachedHabitsAccess(String wsId) {
    return CacheStore.instance.read<bool>(
      key: _cacheKey(wsId),
      decode: _decodeEnabled,
    );
  }

  Future<bool> isHabitsEnabled(String wsId) async {
    final result = await CacheStore.instance.prefetch<bool>(
      key: _cacheKey(wsId),
      policy: _cachePolicy,
      decode: _decodeEnabled,
      fetch: () => _api.getJson(HabitsEndpoints.access(wsId)),
      tags: const [_cacheTag],
    );
    return result.data ?? false;
  }
}
