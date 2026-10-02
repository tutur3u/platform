part of 'cache_store.dart';

extension CacheStoreRefresh on CacheStore {
  Future<CacheReadResult<T>> prefetch<T>({
    required CacheKey key,
    required CachePolicy policy,
    required CacheJsonDecoder<T> decode,
    required Future<Object?> Function() fetch,
    bool forceRefresh = false,
    List<String> tags = const <String>[],
  }) async {
    final awaitFresh = forceRefresh || CacheStore.awaitingRevalidation;
    _registerRefresh(key, policy, () async {
      await prefetch<T>(
        key: key,
        policy: policy,
        decode: decode,
        fetch: fetch,
        forceRefresh: true,
        tags: tags,
      );
    });
    final revision = _revisionFor(key);
    if (_isClearing(key)) {
      return CacheReadResult<T>(state: CacheEntryState.missing);
    }
    final cached = await read<T>(key: key, decode: decode);
    if (_isClearing(key) || revision != _revisionFor(key)) {
      return CacheReadResult<T>(state: CacheEntryState.missing);
    }
    final flightKey = '$revision:${key.value}';
    Future<Object?> refresh() => _inFlight.putIfAbsent(flightKey, () {
      _flightScopes[flightKey] = (key: key, tags: tags);
      return Future<Object?>.sync(fetch)
          .then((payload) async {
            // Never resurrect data invalidated by a mutation or account logout.
            if (revision == _revisionFor(key)) {
              try {
                await write(
                  key: key,
                  policy: policy,
                  payload: payload,
                  tags: tags,
                  expectedRevision: revision,
                );
              } on Object {
                debugPrint(
                  'Cache persistence unavailable; using network data.',
                );
              }
            }
            return payload;
          })
          .whenComplete(() {
            // Remove the reference without returning/awaiting this same future.
            // ignore: discarded_futures
            _inFlight.remove(flightKey);
            _flightScopes.remove(flightKey);
          });
    });

    // Auth-sensitive resources handle permission failures in their callers.
    // Preserve their explicit refresh contract so a background 403 cannot
    // leave a denied snapshot visible without triggering caller cleanup.
    if (cached.hasValue && !awaitFresh && policy.allowBackgroundRefresh) {
      _CacheRevalidationScope.recordSnapshot();
      unawaited(refresh().then<void>((_) {}, onError: (Object _) {}));
      return cached;
    }

    final payload = await refresh();
    if (_isClearing(key) || revision != _revisionFor(key)) {
      return CacheReadResult<T>(state: CacheEntryState.missing);
    }

    return CacheReadResult<T>(
      state: CacheEntryState.fresh,
      data: decode(payload),
      fetchedAt: DateTime.now(),
      hasValue: true,
    );
  }

  void _registerRefresh(
    CacheKey key,
    CachePolicy policy,
    Future<void> Function() refresh,
  ) {
    if (!policy.allowBackgroundRefresh ||
        (!policy.refreshOnReconnect && !policy.refreshOnResume)) {
      return;
    }
    _refreshTasks.remove(key.value);
    _refreshTasks[key.value] = (key: key, policy: policy, refresh: refresh);
    // Keep opportunistic callbacks bounded, including filtered/search reads.
    if (_refreshTasks.length > 128) {
      _refreshTasks.remove(_refreshTasks.keys.first);
    }
  }

  /// Refresh previously visited resources for the currently authenticated user.
  /// Cached snapshots and pending writes survive transport failures.
  Future<void> refreshCachedResources({
    required String? Function() currentUserId,
    bool onResume = false,
  }) async {
    final userId = currentUserId();
    if (userId == null) return;
    final tasks = _refreshTasks.values
        .where(
          (task) =>
              task.key.userId == userId &&
              (onResume
                  ? task.policy.refreshOnResume
                  : task.policy.refreshOnReconnect),
        )
        .toList(growable: false);
    for (var index = 0; index < tasks.length; index += 3) {
      if (currentUserId() != userId) return;
      await Future.wait(
        tasks.skip(index).take(3).map((task) async {
          if (currentUserId() != userId ||
              _refreshTasks[task.key.value]?.refresh != task.refresh) {
            return;
          }
          try {
            await task.refresh();
          } on Object {
            // Screens own permission/error presentation. Never erase snapshots
            // merely because a connected interface cannot reach the server.
          }
        }),
      );
    }
  }
}
