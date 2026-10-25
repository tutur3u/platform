import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Stores individual preferences without coupling personal and workspace data.
class CalendarSettingsCache {
  CalendarSettingsCache({
    required this.namespace,
    CacheStore? store,
    String? Function()? userId,
  }) : _store = store ?? CacheStore.instance,
       _userId = userId ?? currentCacheUserId;

  final String namespace;
  final CacheStore _store;
  final String? Function() _userId;
  final _versions = <(String, String?), int>{};
  final _denied = <(String, String?)>{};
  bool _disposed = false;

  CacheKey key(String actor, String? workspaceId) =>
      CacheKey(namespace: namespace, userId: actor, workspaceId: workspaceId);

  static bool deniesSnapshot(Object error) =>
      error is ApiException &&
      (error.statusCode == 401 ||
          (error.statusCode == 403 && !error.isVerificationRequired));

  void fence(String actor, String? workspaceId) {
    final scope = (actor, workspaceId);
    _versions[scope] = (_versions[scope] ?? 0) + 1;
  }

  void _check(String actor, (String, String?) scope, int version) {
    if (_disposed || _userId() != actor || (_versions[scope] ?? 0) != version) {
      throw const ApiException(
        message: 'Calendar settings scope changed',
        statusCode: 401,
      );
    }
  }

  Future<String?> snapshot(String actor, String? workspaceId) async {
    // An injected transport can own authentication without a global session.
    // It may read the API, but cannot restore another session's local data.
    if (_userId() == null || _disposed) return null;
    final scope = (actor, workspaceId);
    final version = _versions[scope] ?? 0;
    _check(actor, scope, version);
    if (_denied.contains(scope)) return null;
    final cacheKey = key(actor, workspaceId);
    final revision = _store.resourceRevisionFor(cacheKey);
    String? value;
    try {
      final cached = await _store.read<String>(
        key: cacheKey,
        decode: (json) => (json! as Map)['value'] as String,
      );
      // Expired preferences remain usable offline, subject to access fences.
      value = cached.data;
    } on Object {
      // Persistence availability must not block the authenticated API read.
    }
    _check(actor, scope, version);
    if (_store.resourceRevisionFor(cacheKey) != revision) return null;
    return value;
  }

  Future<String> fetch({
    required String actor,
    required String? workspaceId,
    required Future<String> Function() request,
    bool purgeOnDenied = true,
  }) async {
    if (_disposed) throw StateError('Calendar settings cache is disposed');
    final enabled = _userId() != null;
    final scope = (actor, workspaceId);
    final version = (_versions[scope] ?? 0) + 1;
    _versions[scope] = version;
    void check() {
      if (enabled) _check(actor, scope, version);
    }

    check();
    final cacheKey = key(actor, workspaceId);
    final revision = _store.resourceRevisionFor(cacheKey);
    late final String value;
    try {
      value = await request();
    } on Object catch (error) {
      check();
      if (enabled && purgeOnDenied && deniesSnapshot(error)) {
        _denied.add(scope);
        try {
          await _store.remove(cacheKey, checkScope: check);
        } on Object {
          // Preserve the access denial even if durable purge is unavailable.
          check();
        }
      }
      rethrow;
    }
    check();
    _denied.remove(scope);
    if (enabled && revision == _store.resourceRevisionFor(cacheKey)) {
      try {
        await _store.write(
          key: cacheKey,
          policy: CachePolicies.metadata,
          payload: {'value': value},
          tags: const ['module:settings'],
          expectedRevision: revision,
          checkScope: check,
        );
      } on Object {
        // A confirmed server value remains usable if local storage fails.
      }
    }
    check();
    return value;
  }

  void dispose() {
    _disposed = true;
    _versions.clear();
    _denied.clear();
  }
}
