'use strict';

// CI-equivalent shards for `bun fleet:ci`. Each command mirrors the command a
// GitHub workflow runs for the same check; keep them aligned when a workflow
// changes. weight is the expected minutes on a fast host and orders the queue
// (heaviest first). builds marks shards whose Turbo graph builds packages, so
// they never run on a host with builds: false.
const path = require('node:path');
const { discoverPackages, planShards } = require('../ci/test-shards.js');

const ROOT_SCRIPT_SHARDS = 3;
const UNIT_SHARDS = 4;

// One-time per-host setup steps that shards declare with `setup`.
const SETUPS = {
  // Mirrors the "Build workspace setup" step of the Test unit shards.
  'workspace-build':
    'bun turbo:local run build --concurrency=4 --filter=@tuturuuu/types --filter=@tuturuuu/supabase --filter=@tuturuuu/masonry --filter=@tuturuuu/internal-api --filter=tuturuuu',
};

function rootScriptCommand(index, total) {
  // Mirrors turbo-unit-tests.yaml "Run complete root script suite", split
  // across hosts with Node's built-in --test-shard.
  return [
    'NODE_PATH="$PWD/apps/web/node_modules" ',
    'node -e \'const{discoverScriptTests}=require("./scripts/run-script-tests.js");',
    'const{spawnSync}=require("node:child_process");',
    'const r=spawnSync(process.execPath,["--experimental-strip-types","--test",',
    `"--test-concurrency=4","--test-shard=${index + 1}/${total}",`,
    '"--test-reporter=dot",...discoverScriptTests()],{stdio:"inherit"});',
    "process.exitCode=r.status??1'",
  ].join('');
}

// Unit shards that include Web suites need an owned disposable Redis.
function unitShardsNeedingRedis(root = path.resolve(__dirname, '../..')) {
  return new Set(
    planShards(discoverPackages(root), UNIT_SHARDS).flatMap((shard, index) =>
      shard.packages.includes('@tuturuuu/web') ? [index] : []
    )
  );
}

function defaultShards() {
  const redis = unitShardsNeedingRedis();
  const shards = [
    {
      id: 'type-check',
      workflow: 'type-check.yaml',
      weight: 8,
      builds: true,
      setup: 'workspace-build',
      command:
        "bun turbo:local run type-check --concurrency=4 --filter='!@tuturuuu/tanstack-web'",
    },
  ];
  for (let index = 0; index < UNIT_SHARDS; index++)
    shards.push({
      id: `unit-${index}`,
      workflow: 'turbo-unit-tests.yaml',
      weight: 4,
      builds: true,
      setup: 'workspace-build',
      needs: redis.has(index) ? ['redis'] : [],
      // Web suites need an owned disposable Redis; with-redis.sh provides it.
      command: `bash scripts/fleet-ci/with-redis.sh node scripts/ci/run-test-shard.js ${index} ${UNIT_SHARDS}`,
    });
  for (let index = 0; index < ROOT_SCRIPT_SHARDS; index++)
    shards.push({
      id: `root-scripts-${index}`,
      workflow: 'turbo-unit-tests.yaml',
      weight: 2,
      builds: false,
      command: rootScriptCommand(index, ROOT_SCRIPT_SHARDS),
    });
  shards.push(
    {
      id: 'oxlint',
      workflow: 'oxc-check.yaml',
      weight: 1,
      builds: false,
      // The workspace binaries carry the same pinned versions as the workflow;
      // npx in the workspace root cannot resolve catalog: specifiers.
      command: './node_modules/.bin/oxlint --deny-warnings --threads 2 .',
    },
    {
      id: 'oxfmt',
      workflow: 'oxc-check.yaml',
      weight: 1,
      builds: false,
      command: './node_modules/.bin/oxfmt --check .',
    },
    {
      id: 'i18n',
      workflow: 'i18n-check.yaml',
      weight: 1,
      builds: false,
      command: [
        'node scripts/i18n-sort.js --check',
        'bun i18n:check',
        'node scripts/i18n-key-parity.js',
        'bun scripts/i18n-rendered-keys.js',
        'bun scripts/i18n-rendered-settings.js',
        'node scripts/i18n-namespace-check.js',
      ].join(' && '),
    },
    {
      id: 'docs-seo',
      workflow: 'docs-seo-check.yaml',
      weight: 1,
      builds: false,
      command: [
        'node scripts/generate-docs-inventory.js --check',
        'node scripts/generate-app-seo.js --check',
        'node scripts/docs-audit.js',
      ].join(' && '),
    },
    {
      id: 'codex-plugin',
      workflow: 'codex-plugin.yaml',
      weight: 1,
      builds: false,
      command:
        'python3 plugins/tuturuuu/scripts/validate_plugin.py && python3 -m json.tool apps/docs/docs.json > /dev/null',
    }
  );
  return shards;
}

function selectShards(shards, only) {
  if (!only?.length) return shards;
  const selected = shards.filter((shard) =>
    only.some((pattern) =>
      pattern.endsWith('*')
        ? shard.id.startsWith(pattern.slice(0, -1))
        : shard.id === pattern
    )
  );
  if (!selected.length)
    throw new Error(`No fleet CI shard matches ${only.join(', ')}`);
  return selected;
}

module.exports = {
  ROOT_SCRIPT_SHARDS,
  SETUPS,
  UNIT_SHARDS,
  defaultShards,
  rootScriptCommand,
  selectShards,
  unitShardsNeedingRedis,
};
