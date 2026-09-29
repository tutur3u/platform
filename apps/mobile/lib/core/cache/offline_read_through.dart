import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Returns the last encrypted, account-scoped response immediately while
/// revalidating it in the background. Uncached requests still await the API.
Future<Map<String, dynamic>> readThroughJson({
  required ApiClient api,
  required String namespace,
  required String workspaceId,
  required String path,
  CachePolicy policy = CachePolicies.moduleData,
  bool forceRefresh = false,
}) async {
  final userId = currentCacheUserId();
  if (userId == null) return await api.getJson(path);
  final key = CacheKey(
    namespace: namespace,
    userId: userId,
    workspaceId: workspaceId,
    params: {'path': path},
  );
  final result = await CacheStore.instance.prefetch<Map<String, dynamic>>(
    key: key,
    policy: policy,
    decode: (payload) => Map<String, dynamic>.from(payload! as Map),
    fetch: () async {
      try {
        return await api.getJson(path);
      } on ApiException catch (error) {
        if (error.statusCode == 401 || error.statusCode == 403) {
          await CacheStore.instance.remove(key);
        }
        rethrow;
      }
    },
    forceRefresh: forceRefresh,
    tags: ['module:${namespace.split('.').first}', 'workspace:$workspaceId'],
  );
  return result.data ?? const {};
}

Future<List<dynamic>> readThroughJsonList({
  required ApiClient api,
  required String namespace,
  required String workspaceId,
  required String path,
  CachePolicy policy = CachePolicies.moduleData,
  bool forceRefresh = false,
}) async {
  final userId = currentCacheUserId();
  if (userId == null) return await api.getJsonList(path);
  final key = CacheKey(
    namespace: namespace,
    userId: userId,
    workspaceId: workspaceId,
    params: {'path': path},
  );
  final result = await CacheStore.instance.prefetch<List<dynamic>>(
    key: key,
    policy: policy,
    decode: (payload) => List<dynamic>.from(payload! as List),
    fetch: () async {
      try {
        return await api.getJsonList(path);
      } on ApiException catch (error) {
        if (error.statusCode == 401 || error.statusCode == 403) {
          await CacheStore.instance.remove(key);
        }
        rethrow;
      }
    },
    forceRefresh: forceRefresh,
    tags: ['module:${namespace.split('.').first}', 'workspace:$workspaceId'],
  );
  return result.data ?? const [];
}
