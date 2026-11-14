// A Worker's `*.workers.dev` origin and its preview URLs bypass the zone's WAF,
// rate limits and routes. Every Worker deploy config must therefore set both
// `workers_dev` and `preview_urls` to a literal `false`, so a redeploy never
// re-enables a public origin. Wrangler treats a missing `workers_dev` as on.
//
// PENDING lists the configs that still need their own change; it may only
// shrink. Fixing a listed config fails this test until its entry is removed.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const CONFIG_FILE =
  /^(wrangler[^/]*\.(jsonc|json|toml)|void[^/]*\.config\.ts|cloudflare\.config\.ts)$/;
const SKIPPED_DIRECTORIES = new Set([
  '.next',
  '.open-next',
  '.output',
  '.turbo',
  '.wrangler',
  '__fixtures__',
  'dist',
  'fixtures',
  'node_modules',
  'test-fixtures',
]);

const PENDING = new Map([
  ['apps/apps/void.config.ts', 'workers_dev enabled'],
  ['apps/apps/wrangler.staging.jsonc', 'workers_dev enabled'],
  ['apps/backend/wrangler.jsonc', 'paused runtime; flags unset'],
  ['apps/calendar/void.config.ts', 'preview_urls unset'],
  ['apps/colab/wrangler.jsonc', 'flags unset'],
  ['apps/coordination/cloudflare.config.ts', 'caller check pending'],
  ['apps/coordination/wrangler.publish.jsonc', 'caller check pending'],
  ['apps/devbox-control/cloudflare.config.ts', 'caller check pending'],
  ['apps/devbox-control/wrangler.publish.jsonc', 'caller check pending'],
  ['apps/infrastructure/void.config.ts', 'preview_urls unset'],
  ['apps/learn/void.config.ts', 'workers_dev enabled'],
  ['apps/mail/void.config.ts', 'preview_urls unset'],
  ['apps/marketing/void.config.ts', 'workers_dev enabled'],
  ['apps/ops-hub/cloudflare.config.ts', 'workers_dev enabled'],
  ['apps/pay/void.config.ts', 'preview_urls unset'],
  ['apps/roadmap/void.config.ts', 'Web proxies to its workers.dev origin'],
  ['apps/shortener/void.config.ts', 'staging profile uses workers.dev'],
  ['apps/teach/void.config.ts', 'workers_dev enabled'],
  ['apps/turbo-cache/cloudflare.config.ts', 'preview_urls unset'],
]);

const FLAGS = [
  {
    name: 'workers_dev',
    pattern: /["']?(?:workers_dev|workersDev)["']?\s*[:=]\s*([^,\n}]+)/g,
  },
  {
    name: 'preview_urls',
    pattern: /["']?(?:preview_urls|previewUrls)["']?\s*[:=]\s*([^,\n}]+)/g,
  },
];

function findWorkerConfigs(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        findWorkerConfigs(entryPath, found);
      }
    } else if (entry.isFile() && CONFIG_FILE.test(entry.name)) {
      found.push(path.relative(repoRoot, entryPath).split(path.sep).join('/'));
    }
  }
  return found;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1');
}

function publicOriginViolations(source) {
  const text = stripComments(source);
  const violations = [];
  for (const flag of FLAGS) {
    const values = [...text.matchAll(flag.pattern)].map((match) =>
      match[1].trim()
    );
    if (values.length === 0) violations.push(`${flag.name} is unset`);
    for (const value of values) {
      if (value !== 'false') violations.push(`${flag.name} is ${value}`);
    }
  }
  return violations;
}

test('flag parser rejects unset, enabled and computed values', () => {
  assert.deepEqual(
    publicOriginViolations('"workers_dev": false,\n"preview_urls": false,'),
    []
  );
  assert.deepEqual(
    publicOriginViolations('workersDev: false,\npreviewUrls: false }'),
    []
  );
  assert.deepEqual(publicOriginViolations('{ "name": "x" }'), [
    'workers_dev is unset',
    'preview_urls is unset',
  ]);
  assert.deepEqual(
    publicOriginViolations(
      'workers_dev: profile.workersDev,\n// preview_urls: false\npreview_urls: true'
    ),
    ['workers_dev is profile.workersDev', 'preview_urls is true']
  );
});

test('every Worker config disables workers.dev and preview URLs', () => {
  const configs = findWorkerConfigs(path.join(repoRoot, 'apps'));
  assert.ok(configs.length > 0, 'no Worker configs found');

  const failures = [];
  for (const config of configs) {
    const violations = publicOriginViolations(
      readFileSync(path.join(repoRoot, config), 'utf8')
    );
    const pending = PENDING.has(config);
    if (pending && violations.length === 0) {
      failures.push(`${config}: compliant; remove it from PENDING`);
    } else if (!pending && violations.length > 0) {
      failures.push(`${config}: ${violations.join('; ')}`);
    }
  }
  for (const config of PENDING.keys()) {
    if (!configs.includes(config)) {
      failures.push(`${config}: missing; remove it from PENDING`);
    }
  }

  assert.deepEqual(failures, []);
});
