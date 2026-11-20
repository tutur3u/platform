import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/sync/smart_sync.dart';

SyncPolicy syncDomainPolicy(String namespace, CachePolicy cachePolicy) {
  final domain = namespace.split('.').first;
  final ttl = switch (domain) {
    'notifications' => const Duration(seconds: 45),
    'chat' => const Duration(minutes: 1),
    'mail' => const Duration(minutes: 2),
    'tasks' => const Duration(minutes: 3),
    'calendar' => const Duration(minutes: 5),
    _ => cachePolicy.staleAfter,
  };
  return SyncPolicy(
    ttl: ttl,
    triggers: {
      if (cachePolicy.refreshOnResume) SyncTrigger.resume,
      if (cachePolicy.refreshOnReconnect) SyncTrigger.reconnect,
      if (domain == 'notifications' || domain == 'chat' || domain == 'mail')
        SyncTrigger.pushHint,
      SyncTrigger.osRefresh,
    },
  );
}
