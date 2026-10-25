import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';

/// A resumable plan contains product IDs and network consent, never credentials
/// or API payloads. Resume must use a newly verified current actor/workspace.
class OfflinePreparationIntent {
  const OfflinePreparationIntent({
    required this.products,
    this.wifiOnly = true,
    this.retryAt,
    this.retryAttempts = 0,
  });
  final Set<String> products;
  final bool wifiOnly;
  final DateTime? retryAt;
  final int retryAttempts;
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
          retryAt: json['retryAt'] is String
              ? DateTime.tryParse(json['retryAt'] as String)
              : null,
          retryAttempts: json['retryAttempts'] is int
              ? (json['retryAttempts'] as int).clamp(0, 3)
              : 0,
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
      'retryAt': intent?.retryAt?.toUtc().toIso8601String(),
      'retryAttempts': intent?.retryAttempts ?? 0,
    },
  );
}
