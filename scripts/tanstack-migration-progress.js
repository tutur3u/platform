const TERMINAL_STATUSES = new Set(['accepted-removal', 'migrated']);
const OWNER_LABELS = new Map([
  ['rust-backend', 'Rust backend'],
  ['tanstack-start', 'TanStack Start'],
]);
const TOP_LEGACY_ROUTE_LIMIT = 20;
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST_PATH = path.join(
  ROOT_DIR,
  'apps',
  'tanstack-web',
  'migration',
  'route-manifest.json'
);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    format: 'text',
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--manifest') {
      args.manifestPath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--json') {
      args.format = 'json';
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readManifest(manifestPath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(manifestPath, 'utf8'));
}

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

function formatBucket(bucket) {
  return `${bucket.label}: ${bucket.terminal}/${bucket.total} terminal (${bucket.percentComplete}%), ${bucket.remaining} remaining`;
}

function formatRoute(route) {
  const methods = route.methods?.length ? route.methods.join(',') : 'none';
  return `${route.routePath} [${route.kind}; ${route.targetOwner}; ${methods}] ${route.sourceFile}`;
}

function formatProgressReport(progress, manifestPath) {
  return [
    `Manifest: ${path.relative(ROOT_DIR, manifestPath)}`,
    formatBucket(progress.totals),
    '',
    'By owner:',
    ...progress.byOwner.map((bucket) => `- ${formatBucket(bucket)}`),
    '',
    'By kind:',
    ...progress.byKind.map((bucket) => `- ${formatBucket(bucket)}`),
    '',
    'Top legacy routes:',
    ...progress.topLegacyRoutes.map((route) => `- ${formatRoute(route)}`),
  ].join('\n');
}

function printHelp() {
  console.log(`Usage: node scripts/tanstack-migration-progress.js [options]

Options:
  --manifest <path>  Route manifest path
  --json             Print JSON progress
  --help, -h         Show this help
`);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    return 0;
  }

  const manifest = readManifest(args.manifestPath);
  const progress = summarizeMigrationProgress(manifest.routes ?? []);

  if (args.format === 'json') {
    console.log(JSON.stringify(progress, null, 2));
  } else {
    console.log(formatProgressReport(progress, args.manifestPath));
  }

  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_MANIFEST_PATH,
  formatProgressReport,
  parseArgs,
  readManifest,
  summarizeMigrationProgress,
};
