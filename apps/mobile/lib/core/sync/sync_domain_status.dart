import 'package:mobile/core/sync/smart_sync.dart';

/// Per-domain sync health for the debug diagnostics view. It carries no cache
/// keys, so it never shows a user, workspace or request parameter.
class SyncDomainStatus {
  const SyncDomainStatus({
    required this.domain,
    required this.resources,
    required this.lastSuccess,
    required this.failures,
    required this.retryAfter,
  });

  /// First namespace segment, matching `syncDomainPolicy` (e.g. `tasks`).
  final String domain;

  /// Remembered resources in this domain.
  final int resources;

  /// Latest successful refresh of any resource in the domain.
  final DateTime? lastSuccess;

  /// Consecutive failures summed over the domain's resources.
  final int failures;

  /// Latest pending retry back-off among the domain's resources.
  final DateTime? retryAfter;
}

/// Domain of a SmartSync key. Cache keys start with their namespace and use
/// `|` before the scope fields. Keys hashed for length (`sha256:`) and any
/// other key fall under `other`.
String syncDomainOf(Object key) {
  if (key is! String || key.isEmpty || key.startsWith('sha256:')) {
    return 'other';
  }
  final namespace = key.split('|').first;
  final domain = namespace.split('.').first;
  return domain.isEmpty ? 'other' : domain;
}

/// Groups per-key history by domain, sorted by domain name.
List<SyncDomainStatus> summarizeSyncDomains(Iterable<SyncKeyStatus> keys) {
  final grouped = <String, List<SyncKeyStatus>>{};
  for (final status in keys) {
    (grouped[syncDomainOf(status.key)] ??= []).add(status);
  }
  DateTime? latest(Iterable<DateTime?> values) {
    DateTime? result;
    for (final value in values) {
      if (value != null && (result == null || value.isAfter(result))) {
        result = value;
      }
    }
    return result;
  }

  return [
    for (final domain in grouped.keys.toList()..sort())
      SyncDomainStatus(
        domain: domain,
        resources: grouped[domain]!.length,
        lastSuccess: latest(grouped[domain]!.map((s) => s.lastSuccess)),
        failures: grouped[domain]!.fold(0, (sum, s) => sum + s.failures),
        retryAfter: latest(grouped[domain]!.map((s) => s.retryAfter)),
      ),
  ];
}
