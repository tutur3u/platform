part of 'inventory_repository.dart';

const _inventoryModuleTag = 'module:inventory';

extension InventoryCacheSnapshot on InventoryRepository {
  InventoryOverview? peekOverview(String wsId) =>
      _peekInventory('overview', wsId, InventoryOverview.fromJson);

  ({List<InventoryProduct> data, int count})? peekProducts(
    String wsId, {
    String query = '',
    int pageSize = 20,
  }) {
    final cached = _peekInventory(
      'products',
      wsId,
      (json) => (
        data: (json['data'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(InventoryProduct.fromJson)
            .toList(),
        count: (json['count'] as num?)?.toInt() ?? 0,
      ),
      params: {
        'query': query.trim(),
        'status': 'active',
        'page': '1',
        'pageSize': '$pageSize',
      },
    );
    if (cached == null) return null;
    final data = overlayPendingProducts(
      wsId,
      cached.data,
      _mutationQueue.pending.value,
      query: query.trim(),
    );
    return (data: data, count: cached.count + data.length - cached.data.length);
  }

  ({List<InventorySaleSummary> data, int count, bool realtimeEnabled})?
  peekSales(String wsId, {int limit = 20, String? periodId}) {
    final cached = _peekInventory(
      'sales',
      wsId,
      (json) => (
        data: (json['data'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(InventorySaleSummary.fromJson)
            .toList(growable: false),
        count: (json['count'] as num?)?.toInt() ?? 0,
        realtimeEnabled: json['realtime_enabled'] as bool? ?? false,
      ),
      params: {'limit': '$limit', 'offset': '0', 'periodId': periodId ?? ''},
    );
    if (cached == null) return null;
    return _overlayPendingInventorySales(
      wsId,
      cached,
      periodId: periodId,
      pending: _mutationQueue.pending.value,
    );
  }

  List<InventorySalesPeriod>? peekSalesPeriods(String wsId) => _peekInventory(
    'sales-periods',
    wsId,
    (json) => (json['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(InventorySalesPeriod.fromJson)
        .toList(growable: false),
    params: const {'includeArchived': 'true'},
  );

  T? _peekInventory<T>(
    String namespace,
    String wsId,
    T Function(Map<String, dynamic>) decode, {
    Map<String, String> params = const {},
  }) {
    final cached = _cacheStore.peek<T>(
      key: _inventoryCacheKey(namespace, wsId, params: params),
      decode: (json) => decode(Map<String, dynamic>.from(json! as Map)),
    );
    return cached.data;
  }
}

extension _InventoryRepositoryCache on InventoryRepository {
  CacheKey _inventoryCacheKey(
    String namespace,
    String wsId, {
    Map<String, String> params = const {},
  }) {
    return CacheKey(
      namespace: 'inventory.$namespace',
      userId: _cacheUserId(),
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
    final key = _inventoryCacheKey(namespace, wsId, params: params);
    T decodePayload(Object? json) {
      if (json is! Map) {
        throw const FormatException('Invalid inventory cache payload.');
      }
      return decode(Map<String, dynamic>.from(json));
    }

    T? data;
    try {
      final result = await _cacheStore.prefetch<T>(
        key: key,
        policy: policy,
        decode: decodePayload,
        fetch: () async {
          try {
            return await fetch();
          } on ApiException catch (error) {
            if (error.statusCode == 401 ||
                (error.statusCode == 403 && !error.isVerificationRequired)) {
              await _cacheStore.remove(key);
            }
            rethrow;
          }
        },
        forceRefresh: forceRefresh,
        tags: [_inventoryModuleTag, 'workspace:$wsId', ...tags],
      );
      data = result.data;
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      data = (await _cacheStore.read<T>(key: key, decode: decodePayload)).data;
      if (data == null) rethrow;
    }
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
    final key = _inventoryCacheKey(namespace, wsId, params: params);
    T decodePayload(Object? json) {
      if (json is! List) {
        throw const FormatException('Invalid inventory cache payload.');
      }
      return decode(List<dynamic>.from(json));
    }

    T? data;
    try {
      final result = await _cacheStore.prefetch<T>(
        key: key,
        policy: policy,
        decode: decodePayload,
        fetch: () async {
          try {
            return await fetch();
          } on ApiException catch (error) {
            if (error.statusCode == 401 ||
                (error.statusCode == 403 && !error.isVerificationRequired)) {
              await _cacheStore.remove(key);
            }
            rethrow;
          }
        },
        forceRefresh: forceRefresh,
        tags: [_inventoryModuleTag, 'workspace:$wsId', ...tags],
      );
      data = result.data;
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      data = (await _cacheStore.read<T>(key: key, decode: decodePayload)).data;
      if (data == null) rethrow;
    }
    if (data == null) {
      throw StateError('Inventory cache returned no data for $namespace.');
    }
    return data;
  }

  Future<void> _invalidateInventory(String wsId, Iterable<String> tags) {
    return _cacheStore.invalidateTags({
      ...tags,
      'inventory:audit',
    }, workspaceId: wsId);
  }
}
