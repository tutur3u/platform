const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const { execFileSync } = require('node:child_process');

const DEFAULT_MATRIX = [
  ...Array.from({ length: 4 }, (_, index) => ({
    label: `${index + 1}/4`,
    id: index + 1,
    mode: 'shard',
    shard: index + 1,
    total_shards: 4,
  })),
  ...[
    ['workspace-invite-api', 'workspace-invitations.noauth.spec.ts'],
    [
      'workspace-invite-contacts',
      'workspace-invite-cross-app-access.noauth.spec.ts',
    ],
    [
      'workspace-invite-finance',
      'workspace-invite-finance-access.noauth.spec.ts',
    ],
    ['workspace-invite-mail', 'workspace-invite-mail-access.noauth.spec.ts'],
    ['workspace-invite-tasks', 'workspace-invite-tasks-access.noauth.spec.ts'],
    ['invite-account-shapes', 'workspace-invite-account-shapes.noauth.spec.ts'],
  ].map(([id, spec]) => ({
    label: id,
    id,
    mode: id,
    shard: 1,
    spec,
    total_shards: 1,
  })),
];
const SATELLITES = new Set([
  'contacts',
  'finance',
  'mail',
  'tasks',
  'inventory',
  'storefront',
]);
const NON_RUNTIME_APPS = new Set(['docs', 'mobile', 'backend', 'tanstack-web']);

function parseTree(output) {
  return output
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const match = /^(\d{6}) (blob|commit) ([a-f0-9]{40})\t(.+)$/su.exec(
        record
      );
      if (!match) throw new Error('Unknown tracked tree entry');
      return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
    });
}

// Runtime ownership is deliberately conservative. Unknown apps, scripts and
// configuration participate in every digest; new code cannot silently escape it.
function participates(file, suite) {
  if (/(^|\/)AGENTS\.md$/u.test(file) || /^[^/]+\.md$/u.test(file))
    return false;
  if (/^(docs|plans|plugins|skills|conductor)\//u.test(file)) return false;
  if (
    /^\.(agents?|claude|codex|cursor|gemini|opencode|vscode|windsurf|zed)(\/|$)/u.test(
      file
    )
  )
    return false;
  const app = /^apps\/([^/]+)\//u.exec(file)?.[1];
  if (NON_RUNTIME_APPS.has(app)) return false;
  if (SATELLITES.has(app)) {
    if (suite === 'inventory-storefront')
      return ['inventory', 'storefront'].includes(app);
    if (suite.mode === 'shard') return true;
    if (suite.id === 'invite-account-shapes')
      return ['contacts', 'finance'].includes(app);
    return suite.id === `workspace-invite-${app}`;
  }
  if (file.startsWith('apps/web/e2e/') && /\.spec\.[cm]?[jt]sx?$/u.test(file)) {
    if (suite === 'inventory-storefront') return false;
    return suite.mode === 'shard' || file === `apps/web/e2e/${suite.spec}`;
  }
  return true;
}

function fingerprint(entries, suite, context) {
  const selected = entries.filter((entry) => participates(entry.path, suite));
  const digest = crypto.createHash('sha256');
  digest.update(JSON.stringify({ version: 1, suite, ...context }));
  for (const entry of [...selected].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  )) {
    digest.update(
      `\0${entry.mode}\0${entry.type}\0${entry.oid}\0${entry.path}`
    );
  }
  const id = suite === 'inventory-storefront' ? suite : suite.id;
  return `e2e-proof-v1-${id}-${context.day}-${digest.digest('hex')}`;
}

function cacheContext(env, now) {
  const fields = [
    'ImageVersion',
    'RUNNER_OS',
    'RUNNER_ARCH',
    'E2E_RESULT_CACHE_EPOCH',
  ];
  if (
    fields.some(
      (field) => !env[field] || !/^[a-zA-Z0-9_.-]{1,100}$/u.test(env[field])
    )
  )
    return null;
  if (!Number.isFinite(now.getTime())) return null;
  return {
    day: now.toISOString().slice(0, 10),
    image: env.ImageVersion,
    os: env.RUNNER_OS,
    arch: env.RUNNER_ARCH,
    epoch: env.E2E_RESULT_CACHE_EPOCH,
  };
}

function hasRequiredInputs(entries) {
  const paths = new Set(entries.map((entry) => entry.path));
  return (
    [
      'bun.lock',
      'package.json',
      '.github/workflows/e2e-tests.yaml',
      'apps/web/package.json',
      'apps/web/playwright.config.ts',
      'apps/inventory/playwright.config.ts',
      ...DEFAULT_MATRIX.filter((suite) => suite.spec).map(
        (suite) => `apps/web/e2e/${suite.spec}`
      ),
    ].every((file) => paths.has(file)) &&
    entries.some((entry) => entry.path.startsWith('packages/')) &&
    entries.some((entry) => entry.path.startsWith('apps/database/'))
  );
}

function requestJson(url, token) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'tuturuuu-e2e-result-plan',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        timeout: 10000,
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error('Cache API unavailable'));
          return;
        }
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          text += chunk;
          if (text.length > 2_000_000)
            request.destroy(new Error('Cache API response too large'));
        });
        response.on('error', reject);
        response.on('end', () => {
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error('Invalid cache API response'));
          }
        });
      }
    );
    request.on('timeout', () =>
      request.destroy(new Error('Cache API timeout'))
    );
    request.on('error', reject);
  });
}

async function lookupTrustedCache(key, env, request = requestJson) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(env.GITHUB_REPOSITORY ?? '') || !env.GH_TOKEN)
    return null;
  for (let page = 1; page <= 5; page += 1) {
    const query = new URLSearchParams({
      key,
      ref: 'refs/heads/main',
      per_page: '100',
      page: String(page),
    });
    const data = await request(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/caches?${query}`,
      env.GH_TOKEN
    );
    if (
      !Number.isSafeInteger(data.total_count) ||
      data.total_count < 0 ||
      !Array.isArray(data.actions_caches)
    )
      throw new Error('Uncertain cache history');
    const match = data.actions_caches.find(
      (cache) =>
        cache.key === key &&
        cache.ref === 'refs/heads/main' &&
        Number.isSafeInteger(cache.id) &&
        cache.id > 0 &&
        cache.size_in_bytes > 0 &&
        Number.isFinite(Date.parse(cache.created_at))
    );
    if (match)
      return {
        id: match.id,
        createdAt: new Date(match.created_at).toISOString(),
        ref: match.ref,
      };
    if (page * 100 >= data.total_count) return null;
    if (data.actions_caches.length !== 100)
      throw new Error('Incomplete cache history');
  }
  throw new Error('Cache history exceeds bounded lookup');
}

async function plan({
  entries,
  env = process.env,
  now = new Date(),
  lookup = lookupTrustedCache,
}) {
  const context = cacheContext(env, now);
  const safe = context && Array.isArray(entries) && hasRequiredInputs(entries);
  const disabled = env.E2E_ENABLED === 'false';
  const force = env.EVENT_NAME !== 'push';
  const suites = [...DEFAULT_MATRIX, 'inventory-storefront'];
  const provenance = suites.map((suite) => ({
    suite: typeof suite === 'string' ? suite : suite.id,
    key: safe ? fingerprint(entries, suite, context) : '',
    cache: null,
    run: !disabled,
  }));
  // Bound parallel API work, avoiding serial timeouts across eleven suites.
  let cursor = 0;
  if (!disabled && !force) {
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (cursor < provenance.length) {
          const item = provenance[cursor++];
          if (!item.key) continue;
          try {
            item.cache = await lookup(item.key, env);
          } catch {
            /* Uncertain history executes tests. */
          }
          item.run = !item.cache;
        }
      })
    );
  }
  const jobs = DEFAULT_MATRIX.flatMap((suite, index) =>
    provenance[index].run
      ? [{ ...suite, cache_key: provenance[index].key }]
      : []
  );
  const inventory = provenance.at(-1);
  return {
    matrix: {
      include: jobs.length ? jobs : [{ ...DEFAULT_MATRIX[0], cache_key: '' }],
    },
    run_web: jobs.length > 0,
    run_inventory: inventory.run,
    inventory_key: inventory.key,
    runner_context: safe
      ? { image: context.image, os: context.os, arch: context.arch }
      : null,
    provenance,
  };
}

async function main(env = process.env) {
  let entries = null;
  try {
    entries = parseTree(
      execFileSync('git', ['ls-tree', '-rz', '--full-tree', 'HEAD'], {
        encoding: 'utf8',
        maxBuffer: 32_000_000,
      })
    );
  } catch {
    /* Sparse checkout is supported; missing Git evidence runs everything. */
  }
  const result = await plan({ entries, env });
  if (env.GITHUB_OUTPUT)
    fs.appendFileSync(
      env.GITHUB_OUTPUT,
      `matrix=${JSON.stringify(result.matrix)}\nrun_web=${result.run_web}\nrun_inventory=${result.run_inventory}\ninventory_key=${result.inventory_key}\nrunner_context=${JSON.stringify(result.runner_context)}\n`
    );
  const lines = [
    '### E2E input proof reuse',
    '',
    '| Suite | Decision | Trusted proof |',
    '| --- | --- | --- |',
    ...result.provenance.map(
      (item) =>
        `| ${item.suite} | ${item.run ? 'Run' : item.cache ? 'Reuse unchanged inputs' : 'Disabled'} | ${item.cache ? `main cache ${item.cache.id}; ${item.cache.createdAt}` : 'No reused proof'} |`
    ),
    '',
    'Only exact input keys from main are reusable. Keys expire daily; manual runs execute all suites. Missing inputs, runner identity, or cache history execute tests.',
    '',
  ];
  if (env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  console.log(
    `E2E plan: ${result.run_web ? result.matrix.include.length : 0} web jobs, inventory ${result.run_inventory ? 'run' : 'skip'}.`
  );
  return result;
}

if (require.main === module)
  main().catch(() => {
    process.exitCode = 1;
  });
module.exports = {
  DEFAULT_MATRIX,
  parseTree,
  participates,
  fingerprint,
  cacheContext,
  hasRequiredInputs,
  lookupTrustedCache,
  plan,
  main,
};
