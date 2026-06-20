const TERMINAL_STATUSES = new Set(['accepted-removal', 'migrated']);
const OWNER_LABELS = new Map([
  ['rust-backend', 'Rust backend'],
  ['tanstack-start', 'TanStack Start'],
]);
const TOP_LEGACY_ROUTE_LIMIT = 20;

function summarizeMigrationProgress(routes) {
  const totals = createProgressBucket('total', 'All route artifacts');
  const byOwner = new Map();
  const byKind = new Map();
  const topLegacyRoutes = [];

  for (const route of routes) {
    updateProgressBucket(totals, route);
    updateProgressBucket(
      getProgressBucket(
        byOwner,
        route.targetOwner,
        OWNER_LABELS.get(route.targetOwner) ?? route.targetOwner
      ),
      route
    );
    updateProgressBucket(
      getProgressBucket(byKind, route.kind, route.kind),
      route
    );

    if (
      !TERMINAL_STATUSES.has(route.status) &&
      topLegacyRoutes.length < TOP_LEGACY_ROUTE_LIMIT
    ) {
      topLegacyRoutes.push({
        kind: route.kind,
        methods: route.methods,
        routePath: route.routePath,
        sourceFile: route.sourceFile,
        status: route.status,
        targetOwner: route.targetOwner,
      });
    }
  }

  return {
    byKind: finalizeProgressBuckets([...byKind.values()]),
    byOwner: finalizeProgressBuckets([...byOwner.values()]),
    topLegacyRoutes,
    totals: finalizeProgressBucket(totals),
  };
}

function createProgressBucket(key, label) {
  return {
    acceptedRemoval: 0,
    key,
    label,
    legacyNext: 0,
    migrated: 0,
    percentComplete: 0,
    remaining: 0,
    terminal: 0,
    total: 0,
    unknownStatus: 0,
  };
}

function getProgressBucket(buckets, key, label) {
  if (!buckets.has(key)) {
    buckets.set(key, createProgressBucket(key, label));
  }

  return buckets.get(key);
}

function updateProgressBucket(bucket, route) {
  bucket.total += 1;

  if (route.status === 'accepted-removal') {
    bucket.acceptedRemoval += 1;
  } else if (route.status === 'migrated') {
    bucket.migrated += 1;
  } else if (route.status === 'legacy-next') {
    bucket.legacyNext += 1;
  } else {
    bucket.unknownStatus += 1;
  }
}

function finalizeProgressBuckets(buckets) {
  return buckets
    .map(finalizeProgressBucket)
    .sort(
      (left, right) =>
        right.remaining - left.remaining ||
        right.total - left.total ||
        left.key.localeCompare(right.key)
    );
}

function finalizeProgressBucket(bucket) {
  const terminal = bucket.acceptedRemoval + bucket.migrated;
  const remaining = bucket.legacyNext + bucket.unknownStatus;

  return {
    ...bucket,
    percentComplete:
      bucket.total === 0
        ? 100
        : Number(((terminal / bucket.total) * 100).toFixed(2)),
    remaining,
    terminal,
  };
}

module.exports = {
  summarizeMigrationProgress,
};
