import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';

/// Strict downloads fail on disk errors and cache eviction.
class OfflineDownloadManifest {
  OfflineDownloadManifest(this.store, this.userId, this.currentUserId);

  final CacheStore store;
  final String userId;
  final String? Function() currentUserId;
  final List<CacheKey> _keys = [];
  static final Map<String, Map<String, OfflineDownloadManifest>> _completed =
      {};

  static Set<String> affectedProducts({
    required String userId,
    required String workspaceId,
    required String key,
    required String namespace,
  }) {
    const products = {'finance', 'inventory', 'tasks', 'calendar'};
    if (namespace.startsWith('workspace.permissions')) return products;
    final product = namespace.split('.').first;
    final trackedProduct = namespace == 'finance.exchangeRates'
        ? 'finance-rates'
        : product;
    final manifests = _completed['$userId:$workspaceId'];
    final affected = <String>{
      if (manifests != null)
        for (final entry in manifests.entries)
          if (entry.value._keys.any((source) => source.value == key))
            if (entry.key == 'finance-rates') 'finance' else entry.key,
    };
    // Restored readiness can coexist with just one newly retained manifest.
    // Use product fallback until that product has exact retained-key evidence.
    if (products.contains(product) &&
        !(manifests?.containsKey(trackedProduct) ?? false)) {
      affected.add(product);
    }
    return affected;
  }

  static Future<void> verifyScope(String userId, String workspaceId) async {
    final manifests = _completed['$userId:$workspaceId'];
    if (manifests == null) {
      throw StateError('Offline download retention is not verified.');
    }
    for (final manifest in manifests.values) {
      await manifest.verify();
    }
  }

  static Future<void> verifyProduct(
    String userId,
    String workspaceId,
    String product,
  ) async {
    final manifests = _completed['$userId:$workspaceId'];
    final manifest = manifests?[product];
    if (manifest == null) {
      throw StateError('Offline product retention is not verified.');
    }
    await manifest.verify();
    if (product == 'finance') {
      final rates = manifests?['finance-rates'];
      if (rates == null) {
        throw StateError('Offline exchange rates are not verified.');
      }
      await rates.verify();
    }
  }

  void retain(String product, String workspaceId) {
    _completed.removeWhere((scope, _) => !scope.startsWith('$userId:'));
    (_completed['$userId:$workspaceId'] ??= {})[product] = this;
    if (_completed.length > 8) _completed.remove(_completed.keys.first);
  }

  void checkScope() {
    if (currentUserId() != userId) {
      throw StateError('Offline download account changed.');
    }
  }

  Future<void> save(CacheKey key, Object? payload) async {
    checkScope();
    await store.write(
      key: key,
      policy: CachePolicies.offlineCatalog,
      payload: payload,
      tags: [
        'module:${key.namespace.split('.').first}',
        'workspace:${key.workspaceId}',
      ],
    );
    checkScope();
    _keys.add(key);
  }

  Future<void> verify() async {
    checkScope();
    for (final key in _keys) {
      final cached = await store.read<bool>(key: key, decode: (_) => true);
      if (!cached.hasValue) {
        throw StateError('Offline download exceeds available cache storage.');
      }
      checkScope();
    }
  }

  /// Call only when every page and detail in these namespaces was downloaded.
  /// A failed or incomplete download retains prior snapshots for offline use.
  Future<void> reconcile({
    required String workspaceId,
    required Set<String> namespaces,
  }) async {
    await verify();
    if (_keys.any(
      (key) => key.userId != userId || key.workspaceId != workspaceId,
    )) {
      throw StateError('Offline download contains another cache scope.');
    }
    await store.reconcileCompletedNamespaces(
      userId: userId,
      workspaceId: workspaceId,
      namespaces: namespaces,
      retainedKeys: _keys.map((key) => key.value).toSet(),
      checkScope: checkScope,
    );
    await verify();
  }
}
