part of 'inventory_repository.dart';

const _inventoryModuleTag = 'module:inventory';

extension _InventoryRepositoryCache on InventoryRepository {
  CacheKey _inventoryCacheKey(
    String namespace,
    String wsId, {
    Map<String, String> params = const {},
  }) {
    return CacheKey(
      namespace: 'inventory.$namespace',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: params,
    );
  }

  Future<T> _cachedInventoryMap<T>({
    required String namespace,
    required String wsId,
    required Future<Map<String, dynamic>> Function() fetch,
    required T Function(Map<String, dynamic>) decode,
    required List<String> tags,
    Map<String, String> params = const {},
    CachePolicy policy = CachePolicies.moduleData,
    bool forceRefresh = false,
  }) async {
    final result = await CacheStore.instance.prefetch<T>(
      key: _inventoryCacheKey(namespace, wsId, params: params),
      policy: policy,
      decode: (json) {
        if (json is! Map) {
          throw const FormatException('Invalid inventory cache payload.');
        }
        return decode(Map<String, dynamic>.from(json));
      },
      fetch: fetch,
      forceRefresh: forceRefresh,
      tags: [_inventoryModuleTag, 'workspace:$wsId', ...tags],
    );
    final data = result.data;
    if (data == null) {
      throw StateError('Inventory cache returned no data for $namespace.');
    }
    return data;
  }

  Future<T> _cachedInventoryList<T>({
    required String namespace,
    required String wsId,
    required Future<List<dynamic>> Function() fetch,
    required T Function(List<dynamic>) decode,
    required List<String> tags,
    Map<String, String> params = const {},
    CachePolicy policy = CachePolicies.metadata,
    bool forceRefresh = false,
  }) async {
    final result = await CacheStore.instance.prefetch<T>(
      key: _inventoryCacheKey(namespace, wsId, params: params),
      policy: policy,
      decode: (json) {
        if (json is! List) {
          throw const FormatException('Invalid inventory cache payload.');
        }
        return decode(List<dynamic>.from(json));
      },
      fetch: fetch,
      forceRefresh: forceRefresh,
      tags: [_inventoryModuleTag, 'workspace:$wsId', ...tags],
    );
    final data = result.data;
    if (data == null) {
      throw StateError('Inventory cache returned no data for $namespace.');
    }
    return data;
  }

  Future<void> _invalidateInventory(String wsId, Iterable<String> tags) {
    return CacheStore.instance.invalidateTags({
      ...tags,
      'inventory:audit',
    }, workspaceId: wsId);
  }
}
