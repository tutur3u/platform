/// Counts are persisted replica identities, never page lengths or server
/// totals.
class OfflineNamespaceInventory {
  const OfflineNamespaceInventory({
    required this.namespace,
    required this.contentRevision,
    required this.items,
    required this.snapshots,
    required this.logicalBytes,
    required this.staleSnapshots,
    required this.expiredSnapshots,
    required this.lastFetch,
    this.serverReportedTotal,
  });
  final String namespace;

  /// Stable for identical persisted sources, independent of pending/status updates.
  final String contentRevision;
  final int items;
  final int snapshots;
  final int logicalBytes;
  final int staleSnapshots;
  final int expiredSnapshots;
  final DateTime lastFetch;

  /// Query total, only when retained pagination snapshots agree on query
  /// and total.
  final int? serverReportedTotal;
}

class OfflineCacheInventory {
  const OfflineCacheInventory({
    required this.namespaces,
    required this.pending,
  });
  final List<OfflineNamespaceInventory> namespaces;
  final int pending;
  int get logicalBytes =>
      namespaces.fold(0, (sum, row) => sum + row.logicalBytes);
}
