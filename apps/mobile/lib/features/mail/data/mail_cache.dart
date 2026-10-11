import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Encrypted, account/workspace-scoped mail lists and thread details.
/// Never caches attachment bytes, credentials, permissions, or compose buffers.
class MailCache {
  MailCache({CacheStore? store, String? Function()? currentUserId})
    : _store = store ?? CacheStore.instance,
      _currentUserId = currentUserId ?? currentCacheUserId,
      _userId = (currentUserId ?? currentCacheUserId)();
  final CacheStore _store;
  final String? Function() _currentUserId;
  final String? _userId;
  static const _policy = CachePolicy(
    staleAfter: Duration(minutes: 1),
    expireAfter: Duration(days: 7),
  );

  final ValueNotifier<String?> accessRevoked = ValueNotifier(null);

  final Map<String, int> _mutationRevisions = {};
  final Map<String, Future<void>> _invalidations = {};
  bool _disabled = false;
  final Set<String> _deniedWorkspaces = {};
  bool get _usable =>
      !_disabled && _userId != null && _userId == _currentUserId();
  CacheKey _key(String wsId, String path) => CacheKey(
    namespace: 'mail.list',
    userId: _userId,
    workspaceId: wsId,
    params: {'path': Uri.encodeComponent(path)},
  );
  Map<String, dynamic> _decode(Object? value) =>
      Map<String, dynamic>.from(value! as Map);

  Map<String, dynamic>? peek(String wsId, String path) {
    if (!_usable || _deniedWorkspaces.contains(wsId)) return null;
    final cached = _store.peek(key: _key(wsId, path), decode: _decode);
    return cached.data;
  }

  Future<Map<String, dynamic>> read(
    String wsId,
    String path,
    Future<Map<String, dynamic>> Function() fetch, {
    bool forceRefresh = false,
  }) async {
    if (_userId != null && _userId != _currentUserId()) {
      throw const ApiException(message: 'Account changed', statusCode: 401);
    }
    if (_deniedWorkspaces.contains(wsId) && !_disabled) {
      throw const ApiException(message: 'Mail access denied', statusCode: 403);
    }
    if (!_usable) return await fetch();
    final key = _key(wsId, path);
    final scopeRevision = _store.scopeRevisionFor(key);
    void checkScope() {
      if (!_usable ||
          _deniedWorkspaces.contains(wsId) ||
          scopeRevision != _store.scopeRevisionFor(key)) {
        throw StateError('Mail request scope changed');
      }
    }

    // Cache availability must never prevent a network read. Only catch the
    // initialization here, so API failures are not retried or hidden.
    try {
      await _store.init();
    } on Object {
      checkScope();
      try {
        final payload = await fetch();
        checkScope();
        return payload;
      } on ApiException catch (error) {
        checkScope();
        if (error.statusCode == 401 || error.statusCode == 403) {
          await denyAccess(wsId);
        }
        rethrow;
      } on Object {
        checkScope();
        rethrow;
      }
    }
    try {
      // Restart once only when this workspace's ordinary mutation interrupted
      // publication. A clear/logout/denial must never revive an old consumer.
      for (var attempt = 0; ; attempt++) {
        checkScope();
        final mutationRevision = _mutationRevisions[wsId] ?? 0;
        final invalidationAtStart = _invalidations[wsId];
        final result = await _store.prefetch(
          key: key,
          policy: _policy,
          decode: _decode,
          checkScope: checkScope,
          fetch: () async {
            checkScope();
            try {
              return await fetch();
            } on ApiException catch (error) {
              checkScope();
              if (error.statusCode == 401 || error.statusCode == 403) {
                await denyAccess(wsId);
              }
              rethrow;
            }
          },
          forceRefresh: forceRefresh || attempt > 0,
          tags: ['mail'],
        );
        checkScope();
        if (result.hasValue && result.data != null) return result.data!;
        final invalidation = _invalidations[wsId] ?? invalidationAtStart;
        if (attempt >= 1 ||
            (invalidation == null &&
                mutationRevision == (_mutationRevisions[wsId] ?? 0))) {
          throw StateError('Mail request was invalidated');
        }
        // A read may have entered after the mutation epoch advanced but before
        // invalidateTags finished. Wait for that same owned invalidation too.
        await invalidation;
        checkScope();
      }
    } on ApiException catch (error) {
      // The fetch callback already owns auth denial and its one scope purge.
      // Re-clearing here could erase a newer session admitted after that purge.
      if (isOfflineTransportFailure(error) || error.statusCode >= 500) {
        checkScope();
        // Keep a previously opened inbox or thread usable during a transient
        // network failure. Auth and permanent errors still surface normally.
        final cached = await snapshot(wsId, path);
        checkScope();
        if (cached != null) return cached;
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>?> snapshot(String wsId, String path) async {
    if (!_usable || _deniedWorkspaces.contains(wsId)) return null;
    try {
      final cached = await _store.read(key: _key(wsId, path), decode: _decode);
      if (!_usable) return null;
      return cached.data;
    } on Object {
      return null;
    }
  }

  Future<void> _snapshotWrites = Future<void>.value();

  Future<void> saveSnapshot(
    String wsId,
    String path,
    Map<String, dynamic> payload,
  ) {
    // Serialize local writes: request deduplication must not discard the latest
    // mailbox/filter selection when several UI updates happen together.
    final write = _snapshotWrites.then((_) async {
      if (!_usable || _deniedWorkspaces.contains(wsId)) return;
      try {
        await _store.prefetch(
          key: _key(wsId, path),
          policy: _policy,
          decode: _decode,
          forceRefresh: true,
          registerRefresh: false,
          tags: const ['mail.view'],
          fetch: () async {
            if (!_usable || _deniedWorkspaces.contains(wsId)) {
              throw StateError('Mail snapshot invalidated');
            }
            return payload;
          },
        );
      } on Object {
        // Persistence cannot make a successful inbox action appear to fail.
      }
    });
    _snapshotWrites = write;
    return write;
  }

  Future<void> denyAccess(String wsId) async {
    if (!_usable || _deniedWorkspaces.contains(wsId)) return;
    // Suppress late snapshots before clearing the encrypted store.
    _deniedWorkspaces.add(wsId);
    accessRevoked.value = wsId;
    try {
      await _store.clearScope(
        userId: _userId,
        workspaceId: wsId,
        namespace: 'mail.list',
      );
    } on Object {
      _disabled = true;
      debugPrint('Mail cache cleanup unavailable; cache disabled');
    }
  }

  Future<T> mutate<T>(String wsId, Future<T> Function() operation) async {
    final key = _key(wsId, 'mutation');
    final scopeRevision = _store.scopeRevisionFor(key);
    try {
      return await operation();
    } finally {
      if (_usable && scopeRevision == _store.scopeRevisionFor(key)) {
        _mutationRevisions[wsId] = (_mutationRevisions[wsId] ?? 0) + 1;
        final previous = _invalidations[wsId];
        final invalidation = Future<void>(() async {
          await previous;
          if (!_usable || scopeRevision != _store.scopeRevisionFor(key)) return;
          try {
            await _store.invalidateTags(
              ['mail'],
              workspaceId: wsId,
              userId: _userId,
            );
          } on Object {
            // Do not report a successful send as failed and invite a duplicate.
            debugPrint('Mail cache invalidation unavailable');
          }
        });
        _invalidations[wsId] = invalidation;
        try {
          await invalidation;
        } finally {
          if (identical(_invalidations[wsId], invalidation)) {
            unawaited(_invalidations.remove(wsId));
          }
        }
      }
    }
  }
}
