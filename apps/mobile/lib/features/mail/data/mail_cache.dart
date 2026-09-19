import 'package:flutter/foundation.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
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
    expireAfter: Duration(minutes: 20),
    allowBackgroundRefresh: false,
  );

  bool get _usable => _userId != null && _userId == _currentUserId();
  CacheKey _key(String wsId, String path) => CacheKey(
    namespace: 'mail.list',
    userId: _userId,
    workspaceId: wsId,
    params: {'path': Uri.encodeComponent(path)},
  );
  Map<String, dynamic> _decode(Object? value) =>
      Map<String, dynamic>.from(value! as Map);

  Map<String, dynamic>? peek(String wsId, String path) {
    if (!_usable) return null;
    final cached = _store.peek(key: _key(wsId, path), decode: _decode);
    return cached.isExpired ? null : cached.data;
  }

  Future<Map<String, dynamic>> read(
    String wsId,
    String path,
    Future<Map<String, dynamic>> Function() fetch, {
    bool forceRefresh = false,
  }) async {
    if (!_usable) return await fetch();
    // Cache availability must never prevent a network read. Only catch the
    // initialization here, so API failures are not retried or hidden.
    try {
      await _store.init();
    } on Object {
      return await fetch();
    }
    try {
      final result = await _store.prefetch(
        key: _key(wsId, path),
        policy: _policy,
        decode: _decode,
        fetch: fetch,
        forceRefresh: forceRefresh,
        tags: ['mail'],
      );
      if (!result.hasValue || result.data == null) {
        throw StateError('Mail request was invalidated');
      }
      return result.data!;
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _store.clearScope(
          userId: _userId,
          workspaceId: wsId,
          namespace: 'mail.list',
        );
      }
      rethrow;
    }
  }

  Future<T> mutate<T>(String wsId, Future<T> Function() operation) async {
    try {
      return await operation();
    } finally {
      if (_usable) {
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
      }
    }
  }
}
