part of 'cache_store.dart';

extension CacheStoreRefresh on CacheStore {
  Future<CacheReadResult<T>> prefetch<T>({
    required CacheKey key,
    required CachePolicy policy,
    required CacheJsonDecoder<T> decode,
    required Future<Object?> Function() fetch,
    bool forceRefresh = false,
    bool registerRefresh = true,
    void Function()? checkScope,
    List<String> tags = const <String>[],
  }) async {
    final awaitFresh = forceRefresh || CacheStore.awaitingRevalidation;
    checkScope?.call();
    final revision = _revisionFor(key);
    if (_isClearing(key)) {
      return CacheReadResult<T>(state: CacheEntryState.missing);
    }
    final cached = await read<T>(key: key, decode: decode);
    if (_isClearing(key) || revision != _revisionFor(key)) {
      return CacheReadResult<T>(state: CacheEntryState.missing);
    }
    checkScope?.call();
    if (registerRefresh) {
      _registerRefresh(key, policy, () async {
        await prefetch<T>(
          key: key,
          policy: policy,
          decode: decode,
          fetch: fetch,
          forceRefresh: true,
          registerRefresh: false,
          checkScope: checkScope,
          tags: tags,
        );
      });
    }
    Future<Object?> fetchWhenAdmitted() async {
      if (_smartSync == null) return await fetch();
      final response = await ForegroundRefresh.run(() async {
        checkScope?.call();
        if (_isClearing(key) || revision != _revisionFor(key)) {
          throw StateError('Cache scope retired before refresh');
        }
        return (payload: await fetch());
      });
      if (response == null) throw StateError('Refresh gate closed');
      return response.payload;
    }

    final flightKey = '$revision:${key.value}';
    Future<Object?> refresh() => _CacheRevalidationScope.refresh(
      this,
      flightKey,
      () => _inFlight.putIfAbsent(flightKey, () {
        _flightScopes[flightKey] = (key: key, tags: tags);
        return Future<Object?>.sync(fetchWhenAdmitted)
            .then((payload) async {
              // Never resurrect data after a mutation or account logout.
              checkScope?.call();
              // A successful HTTP status is not a valid domain snapshot.
              // Decode before replacing the last authorized stored response.
              decode(payload);
              if (revision == _revisionFor(key)) {
                try {
                  await write(
                    key: key,
                    policy: policy,
                    payload: payload,
                    tags: tags,
                    expectedRevision: revision,
                    checkScope: checkScope,
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
      }),
    );

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

  VoidCallback bindSmartSync(
    SmartSync scheduler, {
    required String? Function() currentWorkspaceId,
  }) {
    _smartSync = scheduler;
    _smartWorkspace = currentWorkspaceId;
    return () {
      if (!identical(_smartWorkspace, currentWorkspaceId)) return;
      _smartSync = null;
      _smartWorkspace = null;
    };
  }

  /// Refresh previously visited resources for the currently authenticated user.
  /// Cached snapshots and pending writes survive transport failures.
  Future<bool> refreshCachedResources({
    required String? Function() currentUserId,
    bool onResume = false,
    SyncTrigger? trigger,
    Set<String>? completedOsKeys,
  }) async {
    final smartSync = _smartSync;
    final currentWorkspaceId = _smartWorkspace;
    final userId = currentUserId();
    if (userId == null) return false;
    final workspaceId = currentWorkspaceId?.call();
    bool isScopeCurrent() =>
        currentUserId() == userId && currentWorkspaceId?.call() == workspaceId;
    final tasks = _refreshTasks.values
        .where(
          (task) =>
              task.key.userId == userId &&
              (currentWorkspaceId == null ||
                  task.key.workspaceId == null ||
                  task.key.workspaceId == 'personal' ||
                  task.key.workspaceId == workspaceId) &&
              (smartSync != null ||
                  (onResume
                      ? task.policy.refreshOnResume
                      : task.policy.refreshOnReconnect)),
        )
        .toList(growable: false);
    if (smartSync != null) {
      final reason =
          trigger ?? (onResume ? SyncTrigger.resume : SyncTrigger.reconnect);
      final outcomes = await Future.wait(
        tasks.map((task) async {
          final key = task.key.value;
          final policy = syncDomainPolicy(task.key.namespace, task.policy);
          if (!policy.triggers.contains(reason)) return null;
          if (completedOsKeys?.contains(key) ?? false) return true;
          final outcome = await smartSync.refresh(
            key: key,
            policy: policy,
            trigger: reason,
            fetchedAt: _memory[key]?.fetchedAt,
            isCurrent: () =>
                isScopeCurrent() && _refreshTasks[key]?.refresh == task.refresh,
            fetch: task.refresh,
          );
          if (outcome != SyncOutcome.refreshed) return false;
          completedOsKeys?.add(key);
          return true;
        }),
      );
      return isScopeCurrent() &&
          outcomes.contains(true) &&
          !outcomes.contains(false);
    }
    for (var index = 0; index < tasks.length; index += 3) {
      if (currentUserId() != userId) return false;
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
    return false;
  }
}
