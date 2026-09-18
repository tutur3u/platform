import 'package:flutter/foundation.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Encrypted, account/workspace-scoped mail lists. Never caches attachments,
/// credentials, permissions, or compose buffers.
class MailCache {
  MailCache() : _userId = currentCacheUserId();
  final String? _userId;
  static const _policy = CachePolicy(
    staleAfter: Duration(minutes: 1),
    expireAfter: Duration(minutes: 20),
    allowBackgroundRefresh: false,
  );

  bool get _usable => _userId != null && _userId == currentCacheUserId();
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
    final cached = CacheStore.instance.peek(
      key: _key(wsId, path),
      decode: _decode,
    );
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
      await CacheStore.instance.init();
    } on Object {
      return await fetch();
    }
    try {
      final result = await CacheStore.instance.prefetch(
        key: _key(wsId, path),
        policy: _policy,
        decode: _decode,
        fetch: fetch,
        forceRefresh: forceRefresh,
        tags: ['mail'],
      );
      return result.data!;
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await CacheStore.instance.remove(_key(wsId, path));
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
          await CacheStore.instance.invalidateTags(
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
