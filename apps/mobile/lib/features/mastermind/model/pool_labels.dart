/// Closed account pool labels carried by schema 1.4 `instance` fields.
///
/// The values are opaque display strings and grouping keys. The app never
/// maps them back to an account handle or derives a name from them.
abstract final class PoolLabels {
  static const unknownAccount = 'Unknown account';

  static const claude = {
    'Claude pool A',
    'Claude pool B',
    'Claude pool C',
    'Claude pool D',
    'Claude pool E',
  };

  static const codex = {'Codex pool A', 'Codex pool B'};

  /// `usage.instances[]` and `usage.series[]`.
  static const Set<String> usage = {...claude, ...codex};

  /// `usage.credits[]`.
  static const Set<String> credits = codex;

  /// `products.quotas[]`, `quota_series[]` and `quota_forecasts[]`.
  static const Set<String> quota = {...usage, unknownAccount};
}

/// Closed provider values carried by `children_series[].provider`.
abstract final class ChildrenProviders {
  static const all = {'claude', 'codex', 'antigravity', 'unknown'};
}
