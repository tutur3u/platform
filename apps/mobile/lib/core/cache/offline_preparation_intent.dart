import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';

/// A resumable plan contains product IDs and network consent, never credentials
/// or API payloads. Resume must use a newly verified current actor/workspace.
class OfflinePreparationIntent {
  const OfflinePreparationIntent({
    required this.products,
    this.wifiOnly = true,
  });
  final Set<String> products;
  final bool wifiOnly;
}

abstract interface class OfflinePreparationIntentStore {
  Future<OfflinePreparationIntent?> load(String user, String workspace);
  Future<void> save(
    String user,
    String workspace,
    OfflinePreparationIntent? intent,
  );
}

class CachedOfflinePreparationIntentStore
    implements OfflinePreparationIntentStore {
  static CacheKey _key(String user, String workspace) => CacheKey(
    namespace: 'offline.preparation.intent',
    userId: user,
    workspaceId: workspace,
  );
  @override
  Future<OfflinePreparationIntent?> load(String user, String workspace) async {
    final cached = await CacheStore.instance.read<OfflinePreparationIntent>(
      key: _key(user, workspace),
      decode: (json) {
        if (json is! Map ||
            json['products'] is! List ||
            json['wifiOnly'] is! bool) {
          throw const FormatException('Invalid offline preparation plan');
        }
        return OfflinePreparationIntent(
          products: (json['products'] as List).whereType<String>().toSet(),
          wifiOnly: json['wifiOnly'] as bool,
        );
      },
    );
    return cached.data;
  }

  @override
  Future<void> save(
    String user,
    String workspace,
    OfflinePreparationIntent? intent,
  ) => CacheStore.instance.write(
    key: _key(user, workspace),
    requirePublication: true,
    policy: const CachePolicy(
      staleAfter: Duration(days: 30),
      expireAfter: Duration(days: 30),
      refreshOnResume: false,
      refreshOnReconnect: false,
      allowBackgroundRefresh: false,
    ),
    payload: {
      'products': intent?.products.toList() ?? <String>[],
      'wifiOnly': intent?.wifiOnly ?? true,
    },
  );
}
