import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/cache/offline_network.dart';
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
  CacheStore? cacheStore,
  String? Function()? cacheUserId,
}) async {
  final owner = cacheUserId ?? currentCacheUserId;
  final userId = owner();
  void checkScope() {
    if (userId != null) api.checkUser(userId);
    if (owner() != userId) {
      throw const ApiException(
        message: 'Account changed during cached read',
        statusCode: 401,
      );
    }
  }

  final store = cacheStore ?? CacheStore.instance;
  if (userId == null) {
    final payload = await api.getJson(path);
    checkScope();
    return payload;
  }
  final key = CacheKey(
    namespace: namespace,
    userId: userId,
    workspaceId: workspaceId,
    params: {'path': path},
  );
  final result = await _readRevalidated<Map<String, dynamic>>(
    store: store,
    key: key,
    checkScope: checkScope,
    decode: (payload) => Map<String, dynamic>.from(payload! as Map),
    read: () => store.prefetch<Map<String, dynamic>>(
      key: key,
      policy: policy,
      checkScope: checkScope,
      decode: (payload) => Map<String, dynamic>.from(payload! as Map),
      fetch: () async {
        try {
          checkScope();
          final payload = await ApiClient.runForUser(
            userId,
            () => api.getJson(path),
          );
          checkScope();
          return payload;
        } on Object catch (error) {
          if (error is ApiException &&
              (error.statusCode == 401 ||
                  (error.statusCode == 403 && !error.isVerificationRequired))) {
            await store.remove(key);
          }
          rethrow;
        }
      },
      forceRefresh: forceRefresh,
      tags: ['module:${namespace.split('.').first}', 'workspace:$workspaceId'],
    ),
  );
  if ((forceRefresh || CacheStore.awaitingRevalidation) && !result.hasValue) {
    throw StateError('Response invalidated during refresh.');
  }
  checkScope();
  return result.data ?? const {};
}

Future<List<dynamic>> readThroughJsonList({
  required ApiClient api,
  required String namespace,
  required String workspaceId,
  required String path,
  CachePolicy policy = CachePolicies.moduleData,
  bool forceRefresh = false,
  CacheStore? cacheStore,
  String? Function()? cacheUserId,
}) async {
  final owner = cacheUserId ?? currentCacheUserId;
  final userId = owner();
  void checkScope() {
    if (userId != null) api.checkUser(userId);
    if (owner() != userId) {
      throw const ApiException(
        message: 'Account changed during cached read',
        statusCode: 401,
      );
    }
  }

  final store = cacheStore ?? CacheStore.instance;
  if (userId == null) {
    final payload = await api.getJsonList(path);
    checkScope();
    return payload;
  }
  final key = CacheKey(
    namespace: namespace,
    userId: userId,
    workspaceId: workspaceId,
    params: {'path': path},
  );
  final result = await _readRevalidated<List<dynamic>>(
    store: store,
    key: key,
    checkScope: checkScope,
    decode: (payload) => List<dynamic>.from(payload! as List),
    read: () => store.prefetch<List<dynamic>>(
      key: key,
      policy: policy,
      checkScope: checkScope,
      decode: (payload) => List<dynamic>.from(payload! as List),
      fetch: () async {
        try {
          checkScope();
          final payload = await ApiClient.runForUser(
            userId,
            () => api.getJsonList(path),
          );
          checkScope();
          return payload;
        } on Object catch (error) {
          if (error is ApiException &&
              (error.statusCode == 401 ||
                  (error.statusCode == 403 && !error.isVerificationRequired))) {
            await store.remove(key);
          }
          rethrow;
        }
      },
      forceRefresh: forceRefresh,
      tags: ['module:${namespace.split('.').first}', 'workspace:$workspaceId'],
    ),
  );
  if ((forceRefresh || CacheStore.awaitingRevalidation) && !result.hasValue) {
    throw Exception('Response invalidated during refresh.');
  }
  checkScope();
  return result.data ?? const [];
}

Future<CacheReadResult<T>> _readRevalidated<T>({
  required CacheStore store,
  required CacheKey key,
  required void Function() checkScope,
  required CacheJsonDecoder<T> decode,
  required Future<CacheReadResult<T>> Function() read,
}) async {
  try {
    checkScope();
    final value = await read();
    checkScope();
    return value;
  } on Object catch (error) {
    if (!CacheStore.awaitingRevalidation || !isOfflineTransportFailure(error)) {
      rethrow;
    }
    checkScope();
    final cached = await store.read<T>(key: key, decode: decode);
    checkScope();
    if (!cached.hasValue) rethrow;
    return cached;
  }
}
