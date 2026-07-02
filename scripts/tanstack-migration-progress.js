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
const DEFAULT_README_PATH = path.join(ROOT_DIR, 'README.md');
const README_PROGRESS_START = '<!-- tanstack-rust-migration-progress:start -->';
const README_PROGRESS_END = '<!-- tanstack-rust-migration-progress:end -->';
const README_INSERT_ANCHOR = '\n## What Tuturuuu Builds\n';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    format: 'text',
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    readmeMode: null,
    readmePath: DEFAULT_README_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--manifest') {
      args.manifestPath = path.resolve(readRequiredValue(argv, index, arg));
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

    if (arg === '--readme') {
      args.format = 'readme';
      continue;
    }

    if (arg === '--readme-path') {
      args.readmePath = path.resolve(readRequiredValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--write-readme') {
      args.readmeMode = 'write';
      continue;
    }

    if (arg === '--check-readme') {
      args.readmeMode = 'check';
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readRequiredValue(argv, index, arg) {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${arg}`);
  }

  return value;
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
      const legacyRoute = {
        kind: route.kind,
        methods: route.methods,
        routePath: route.routePath,
        sourceFile: route.sourceFile,
        status: route.status,
        targetOwner: route.targetOwner,
      };

      if (route.id) {
        legacyRoute.id = route.id;
      }

      if (route.method) {
        legacyRoute.method = route.method;
      }

      if (route.parentId) {
        legacyRoute.parentId = route.parentId;
      }

      topLegacyRoutes.push(legacyRoute);
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
  const parent = route.parentId ? ` parent=${route.parentId}` : '';
  return `${route.routePath} [${route.kind}; ${route.targetOwner}; ${methods}] ${route.sourceFile}${parent}`;
}

function formatCount(value) {
  return value.toLocaleString('en-US');
}

function formatPercent(value) {
  return `${value.toFixed(2).replace(/\.?0+$/u, '')}%`;
}

function formatProgressBar(percentComplete, width = 20) {
  let filled = Math.round((percentComplete / 100) * width);

  if (percentComplete > 0 && filled === 0) {
    filled = 1;
  } else if (percentComplete < 100 && filled === width) {
    filled = width - 1;
  }

  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

function getBadgeColor(percentComplete) {
  if (percentComplete >= 90) {
    return '2ea043';
  }

  if (percentComplete >= 70) {
    return '1f6feb';
  }

  if (percentComplete >= 50) {
    return 'd29922';
  }

  if (percentComplete >= 25) {
    return 'fb8c00';
  }

  return 'cf222e';
}

function formatProgressBadge(label, bucket) {
  const params = new URLSearchParams({
    color: getBadgeColor(bucket.percentComplete),
    label,
    message: `${formatPercent(bucket.percentComplete)} terminal`,
    style: 'flat-square',
  });

  return `![${label} migration progress](https://img.shields.io/static/v1?${params.toString()})`;
}

function formatTableRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

function formatReadmeBucketRow(label, bucket) {
  return formatTableRow([
    label,
    `\`${formatProgressBar(bucket.percentComplete)}\` ${formatPercent(bucket.percentComplete)}`,
    `${formatCount(bucket.terminal)} / ${formatCount(bucket.total)}`,
    formatCount(bucket.migrated),
    formatCount(bucket.acceptedRemoval),
    formatCount(bucket.remaining),
  ]);
}

function formatReadmeKindRow(bucket) {
  return formatTableRow([
    bucket.label,
    `\`${formatProgressBar(bucket.percentComplete, 16)}\` ${formatPercent(bucket.percentComplete)}`,
    `${formatCount(bucket.terminal)} / ${formatCount(bucket.total)}`,
    formatCount(bucket.remaining),
  ]);
}

function formatReadmeRouteRow(route) {
  const owner = OWNER_LABELS.get(route.targetOwner) ?? route.targetOwner;
  const methods = route.methods?.length ? route.methods.join(', ') : 'none';

  return formatTableRow([
    `\`${route.routePath}\``,
    owner,
    `\`${methods}\``,
    `\`${route.sourceFile}\``,
  ]);
}

function getOwnerBuckets(progress) {
  const preferredKeys = ['rust-backend', 'tanstack-start'];
  const preferredBuckets = preferredKeys
    .map((key) => progress.byOwner.find((bucket) => bucket.key === key))
    .filter(Boolean);
  const preferredSet = new Set(preferredKeys);
  const remainingBuckets = progress.byOwner.filter(
    (bucket) => !preferredSet.has(bucket.key)
  );

  return [...preferredBuckets, ...remainingBuckets];
}

function formatReadmeProgress(progress, manifestPath = DEFAULT_MANIFEST_PATH) {
  const manifestRelativePath = path
    .relative(ROOT_DIR, manifestPath)
    .split(path.sep)
    .join('/');
  const ownerBuckets = getOwnerBuckets(progress);
  const badges = [
    formatProgressBadge('Overall', progress.totals),
    ...ownerBuckets.map((bucket) => formatProgressBadge(bucket.label, bucket)),
  ];
  const topLegacyRoutes = progress.topLegacyRoutes.slice(0, 5);

  return [
    `_Generated from \`${manifestRelativePath}\`. Refresh with \`bun migration:tanstack:readme\` after route ownership changes._`,
    '',
    badges.join(' '),
    '',
    '| Track | Progress | Terminal | Migrated | Removed | Remaining |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    formatReadmeBucketRow('Overall', progress.totals),
    ...ownerBuckets.map((bucket) =>
      formatReadmeBucketRow(bucket.label, bucket)
    ),
    '',
    '<details>',
    '<summary>Remaining work by route kind</summary>',
    '',
    '| Kind | Progress | Terminal | Remaining |',
    '| --- | --- | ---: | ---: |',
    ...progress.byKind.map(formatReadmeKindRow),
    '',
    '</details>',
    '',
    '<details>',
    '<summary>Next legacy artifacts in the manifest</summary>',
    '',
    '| Route | Owner | Methods | Source |',
    '| --- | --- | --- | --- |',
    ...(topLegacyRoutes.length > 0
      ? topLegacyRoutes.map(formatReadmeRouteRow)
      : ['| None | All tracked artifacts are terminal | `none` | `n/a` |']),
    '',
    '</details>',
  ].join('\n');
}

function replaceReadmeProgressBlock(readmeContent, progressBlock) {
  const generatedBlock = `${README_PROGRESS_START}\n${progressBlock}\n${README_PROGRESS_END}`;
  const startIndex = readmeContent.indexOf(README_PROGRESS_START);
  const endIndex = readmeContent.indexOf(README_PROGRESS_END);

  if (startIndex === -1 && endIndex === -1) {
    const anchorIndex = readmeContent.indexOf(README_INSERT_ANCHOR);

    if (anchorIndex === -1) {
      throw new Error(
        `README is missing ${README_PROGRESS_START} markers and the "${README_INSERT_ANCHOR.trim()}" insert anchor.`
      );
    }

    const prefix = readmeContent.slice(0, anchorIndex);
    const suffix = readmeContent.slice(anchorIndex);

    return `${prefix}\n## Migration Progress\n\n${generatedBlock}\n${suffix}`;
  }

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error('README migration progress markers are malformed.');
  }

  return `${readmeContent.slice(0, startIndex)}${generatedBlock}${readmeContent.slice(endIndex + README_PROGRESS_END.length)}`;
}

function getReadmeProgressBlock(manifestPath, fsImpl = fs) {
  const manifest = readManifest(manifestPath, fsImpl);
  const progress = summarizeMigrationProgress(manifest.routes ?? []);

  return formatReadmeProgress(progress, manifestPath);
}

function writeReadmeProgress({
  fsImpl = fs,
  manifestPath = DEFAULT_MANIFEST_PATH,
  readmePath = DEFAULT_README_PATH,
} = {}) {
  const readmeContent = fsImpl.readFileSync(readmePath, 'utf8');
  const progressBlock = getReadmeProgressBlock(manifestPath, fsImpl);
  const nextReadmeContent = replaceReadmeProgressBlock(
    readmeContent,
    progressBlock
  );
  const changed = nextReadmeContent !== readmeContent;

  if (changed) {
    fsImpl.writeFileSync(readmePath, nextReadmeContent);
  }

  return {
    changed,
    progressBlock,
    readmePath,
  };
}

function checkReadmeProgress({
  fsImpl = fs,
  manifestPath = DEFAULT_MANIFEST_PATH,
  readmePath = DEFAULT_README_PATH,
} = {}) {
  const readmeContent = fsImpl.readFileSync(readmePath, 'utf8');
  const progressBlock = getReadmeProgressBlock(manifestPath, fsImpl);
  const expectedReadmeContent = replaceReadmeProgressBlock(
    readmeContent,
    progressBlock
  );

  if (expectedReadmeContent === readmeContent) {
    return [];
  }

  return [
    `${path.relative(ROOT_DIR, readmePath)} migration progress is stale. Run bun migration:tanstack:readme.`,
  ];
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
  --readme           Print the README progress dashboard block
  --write-readme     Update README.md between generated progress markers
  --check-readme     Verify README.md has the current generated progress block
  --readme-path <path>
                     README path for --write-readme or --check-readme
  --help, -h         Show this help
`);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    return 0;
  }

  if (args.readmeMode === 'write') {
    const result = writeReadmeProgress({
      manifestPath: args.manifestPath,
      readmePath: args.readmePath,
    });
    const relativeReadmePath = path.relative(ROOT_DIR, result.readmePath);
    console.log(
      result.changed
        ? `Updated ${relativeReadmePath} migration progress.`
        : `${relativeReadmePath} migration progress is current.`
    );
    return 0;
  }

  if (args.readmeMode === 'check') {
    const errors = checkReadmeProgress({
      manifestPath: args.manifestPath,
      readmePath: args.readmePath,
    });

    if (errors.length > 0) {
      console.error(errors.join('\n'));
      return 1;
    }

    console.log('README migration progress is current.');
    return 0;
  }

  const manifest = readManifest(args.manifestPath);
  const progress = summarizeMigrationProgress(manifest.routes ?? []);

  if (args.format === 'json') {
    console.log(JSON.stringify(progress, null, 2));
  } else if (args.format === 'readme') {
    console.log(formatReadmeProgress(progress, args.manifestPath));
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
  DEFAULT_README_PATH,
  README_PROGRESS_END,
  README_PROGRESS_START,
  checkReadmeProgress,
  formatProgressBar,
  formatProgressReport,
  formatReadmeProgress,
  parseArgs,
  readManifest,
  replaceReadmeProgressBlock,
  summarizeMigrationProgress,
  writeReadmeProgress,
};
