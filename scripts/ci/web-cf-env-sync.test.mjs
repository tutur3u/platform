// Behavior of scripts/ci/web-cf-env-sync.mjs: name-list expansion, the
// write plan, and that no value reaches a URL, argv, log line or error.
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { test } from 'node:test';
import {
  expandEntry,
  parseNameList,
  readNameLists,
} from './web-cf-env-sync-names.mjs';
import {
  cfPatchSecrets,
  cfReadBindings,
  listSharedEnv,
  patchSecrets,
  patchVars,
  revealValue,
  VercelChallengeError,
} from './web-cf-env-sync-providers.mjs';
import {
  DENIED_NAMES,
  mergeVercelEntries,
  parseArgs,
  planSync,
  revealPlanned,
  run,
  verifyWritten,
} from './web-cf-env-sync.mjs';

const VALUE = 'value-that-must-never-be-printed-0123456789';
const PUBLIC = 'https://public.example.test';

function fetchDouble(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const route = routes.find(
      ({ match, method = 'GET' }) =>
        String(url).includes(match) && (init.method ?? 'GET') === method
    );
    const { status = 200, body = {} } = route?.reply ?? { status: 404 };
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

const leaks = (calls) =>
  calls.filter(
    ({ url, init }) =>
      url.includes(VALUE) || JSON.stringify(init.headers ?? {}).includes(VALUE)
  );

// Names -----------------------------------------------------------------------

test('inventory entries expand app lists, braces, globs and notes', () => {
  const context = { apps: null };
  assert.deepEqual(
    expandEntry('NEXT_PUBLIC_<APP>_APP_URL for CHAT, CMS', context),
    ['NEXT_PUBLIC_CHAT_APP_URL', 'NEXT_PUBLIC_CMS_APP_URL']
  );
  assert.deepEqual(
    expandEntry(
      '<APP>_APP_URL and TUTURUUU_<APP>_BASE_URL for the app list above',
      context
    ),
    [
      'CHAT_APP_URL',
      'CMS_APP_URL',
      'TUTURUUU_CHAT_BASE_URL',
      'TUTURUUU_CMS_BASE_URL',
    ]
  );
  assert.deepEqual(expandEntry('API_{GLOBAL,FREE}_REQUESTS_PER_MINUTE'), [
    'API_GLOBAL_REQUESTS_PER_MINUTE',
    'API_FREE_REQUESTS_PER_MINUTE',
  ]);
  assert.deepEqual(
    expandEntry('NATIVE_INTEGRITY_* (settings and enrollment)'),
    ['NATIVE_INTEGRITY_*']
  );
  assert.throws(() => expandEntry('lower case'), /unparseable/);
  assert.throws(() => expandEntry('<APP>_URL'), /without a for list/);
});

test('inventory lists sync four sections and exclude unset names', () => {
  const list = parseNameList(
    JSON.stringify({
      requiredSecrets: ['SUPABASE_SECRET_KEY'],
      paritySecrets: ['TURNSTILE_SECRET_KEY'],
      publicBuildAndRuntime: ['NEXT_PUBLIC_SUPABASE_URL'],
      runtimeConfig: ['TTR_CSRF_MODE'],
      buildMetadata: ['PLATFORM_BUILD_COMMIT_HASH'],
      unset: { CRON_SECRET: 'no cron routes' },
    })
  );
  assert.deepEqual(
    list.patterns.map(({ pattern }) => pattern),
    [
      'SUPABASE_SECRET_KEY',
      'TURNSTILE_SECRET_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'TTR_CSRF_MODE',
    ]
  );
  assert.deepEqual([...list.excluded], ['CRON_SECRET']);
  const plain = parseNameList('# comment\nA_ONE\n\nB_TWO # trailing\n');
  assert.deepEqual(
    plain.patterns.map(({ pattern }) => pattern),
    ['A_ONE', 'B_TWO']
  );
  const merged = readNameLists(['a', 'b'], (path) =>
    path === 'a' ? '["A_ONE", "*"]' : JSON.stringify({ unset: { A_ONE: '' } })
  );
  assert.deepEqual(
    merged.patterns.map(({ pattern }) => pattern),
    ['A_ONE', '*']
  );
  assert.ok(merged.excluded.has('A_ONE'));
});

// Plan ------------------------------------------------------------------------

const entry = (key, type, source = 'project') => ({
  id: `env_${key}`,
  key,
  type,
  source,
});

test('the plan routes NEXT_PUBLIC_* to vars and reports what it cannot write', () => {
  const vercel = mergeVercelEntries(
    [
      entry('NEXT_PUBLIC_SITE', 'encrypted'),
      entry('API_TOKEN', 'encrypted'),
      entry('PEPPER', 'sensitive'),
      entry('VERCEL_URL', 'system'),
      entry('CONFIG_OWNED', 'plain'),
      entry('NEXT_PUBLIC_SECRETLY', 'plain'),
      entry('LIMIT_A', 'plain'),
      entry('SHADOWED', 'encrypted'),
      entry('UNSET_ONE', 'encrypted'),
      entry('EXTRA', 'encrypted'),
    ],
    [
      entry('SHADOWED', 'encrypted', 'shared'),
      entry('SHARED_ONLY', 'encrypted', 'shared'),
    ]
  );
  assert.equal(vercel.get('SHADOWED').source, 'project');
  const lists = {
    patterns: [
      'NEXT_PUBLIC_SITE',
      'API_TOKEN',
      'PEPPER',
      'VERCEL_URL',
      'CONFIG_OWNED',
      'NEXT_PUBLIC_SECRETLY',
      'LIMIT_*',
      'NOPE_*',
      'NOT_IN_VERCEL',
      'DECLARED_VAR',
      'SHARED_ONLY',
      'UNSET_ONE',
    ].map((pattern) => ({ pattern, section: 'list' })),
    excluded: new Set(['UNSET_ONE']),
  };
  const bindings = [
    { name: 'CONFIG_OWNED', type: 'plain_text' },
    { name: 'NEXT_PUBLIC_SECRETLY', type: 'secret_text' },
    { name: 'DECLARED_VAR', type: 'plain_text' },
  ];
  const { rows, unmatched, unlisted } = planSync({ lists, vercel, bindings });
  const status = Object.fromEntries(
    rows.map((row) => [row.name, [row.destination, row.status]])
  );
  assert.deepEqual(status.NEXT_PUBLIC_SITE, ['var', 'write']);
  assert.deepEqual(status.API_TOKEN, ['secret', 'write']);
  assert.deepEqual(status.SHARED_ONLY, ['secret', 'write']);
  assert.deepEqual(status.LIMIT_A, ['secret', 'write']);
  assert.match(status.PEPPER[1], /^missing: sensitive/);
  assert.match(status.VERCEL_URL[1], /^skip: Vercel system/);
  assert.match(status.CONFIG_OWNED[1], /^skip: bound as plain_text/);
  assert.match(
    status.NEXT_PUBLIC_SECRETLY[1],
    /^conflict: bound as secret_text/
  );
  assert.match(status.NOT_IN_VERCEL[1], /^absent/);
  assert.match(status.DECLARED_VAR[1], /^kept/);
  assert.match(status.UNSET_ONE[1], /^skip: listed as unset/);
  assert.deepEqual(unmatched, ['NOPE_*']);
  assert.deepEqual(unlisted, ['EXTRA', 'SHADOWED']);
  for (const row of rows)
    if (row.status !== 'write') assert.equal(row.destination, 'none');
});

test('denied names are never planned, revealed or reported', () => {
  assert.ok(DENIED_NAMES.includes('DEEPGRAM_API_KEY'));
  const vercel = mergeVercelEntries(
    [
      entry('DEEPGRAM_API_KEY', 'sensitive'),
      entry('DROPPED', 'encrypted'),
      entry('KEEP', 'encrypted'),
    ],
    []
  );
  const lists = {
    patterns: ['DEEPGRAM_API_KEY', '*'].map((pattern) => ({
      pattern,
      section: 'list',
    })),
    excluded: new Set(),
  };
  const plan = planSync({
    lists,
    vercel,
    bindings: [],
    deny: [...DENIED_NAMES, 'DROPPED'],
  });
  assert.deepEqual(
    plan.rows.map((row) => row.name),
    ['KEEP']
  );
  assert.deepEqual(plan.unlisted, []);
  const defaults = planSync({ lists, vercel, bindings: [] });
  assert.ok(!defaults.rows.some((row) => row.name === 'DEEPGRAM_API_KEY'));
  assert.deepEqual(
    parseArgs(['--worker', 'tuturuuu-web-x', '--deny', 'DROPPED']).deny,
    [...DENIED_NAMES, 'DROPPED']
  );
  assert.throws(
    () => parseArgs(['--worker', 'tuturuuu-web-x', '--deny', 'bad name']),
    /--deny/
  );
});

test('reveals fail closed on oversized values and drop empty ones', async () => {
  const rows = [
    { name: 'NEXT_PUBLIC_A', destination: 'var', status: 'write' },
    { name: 'B', destination: 'secret', status: 'write' },
    { name: 'C', destination: 'secret', status: 'write' },
  ];
  const vercel = new Map(
    rows.map(({ name }) => [name, entry(name, 'encrypted')])
  );
  const values = { NEXT_PUBLIC_A: PUBLIC, B: VALUE, C: '' };
  const result = await revealPlanned({
    rows,
    vercel,
    reveal: async ({ key }) => values[key],
  });
  assert.deepEqual(result.vars, { NEXT_PUBLIC_A: PUBLIC });
  assert.deepEqual(result.secrets, { B: VALUE });
  assert.deepEqual(result.empty, ['C']);
  assert.match(rows[2].status, /^missing: empty/);
  await assert.rejects(
    revealPlanned({
      rows: [{ name: 'B', destination: 'secret', status: 'write' }],
      vercel,
      reveal: async () => 'x'.repeat(5 * 1024 + 1),
    }),
    (error) => /5 KiB/.test(error.message) && !error.message.includes('xxxx')
  );
});

test('readback compares vars and secret types without printing values', () => {
  const bindings = [
    { name: 'NEXT_PUBLIC_A', type: 'plain_text', text: 'stale' },
    { name: 'B', type: 'secret_text' },
  ];
  assert.throws(
    () =>
      verifyWritten({
        bindings,
        vars: { NEXT_PUBLIC_A: VALUE },
        secrets: { B: VALUE, C: VALUE },
      }),
    (error) =>
      error.message.includes('NEXT_PUBLIC_A (var)') &&
      error.message.includes('C (secret)') &&
      !error.message.includes(VALUE) &&
      !error.message.includes('stale')
  );
});

// Providers -------------------------------------------------------------------

test('Vercel reveal maps a step-up demand and never quotes the body', async () => {
  const challenged = fetchDouble([
    {
      match: '/v1/projects/prj/env/env_A',
      reply: {
        status: 403,
        body: { error: { code: 'challenge_required', message: VALUE } },
      },
    },
  ]);
  await assert.rejects(
    revealValue({
      token: 't',
      projectId: 'prj',
      entry: entry('A', 'encrypted'),
      fetchImpl: challenged.fetchImpl,
    }),
    VercelChallengeError
  );
  const shared = fetchDouble([
    { match: '/v1/env/env_S', reply: { body: { value: VALUE } } },
  ]);
  assert.equal(
    await revealValue({
      token: 't',
      projectId: 'prj',
      entry: entry('S', 'encrypted', 'shared'),
      fetchImpl: shared.fetchImpl,
    }),
    VALUE
  );
  const failing = fetchDouble([
    {
      match: '/env/env_F',
      reply: { status: 500, body: { error: { code: VALUE, message: VALUE } } },
    },
  ]);
  await assert.rejects(
    revealValue({
      token: 't',
      projectId: 'prj',
      entry: entry('F', 'encrypted'),
      fetchImpl: failing.fetchImpl,
    }),
    (error) => /HTTP 500/.test(error.message) && !error.message.includes(VALUE)
  );
});

test('shared env keeps production entries linked to the project, across pages', async () => {
  let page = 0;
  const fetchImpl = async (url) => {
    page++;
    const data =
      page === 1
        ? [
            {
              id: 'a1',
              key: 'MINE',
              type: 'encrypted',
              target: ['production'],
              projectId: ['prj'],
            },
            {
              id: 'a2',
              key: 'OTHER',
              type: 'encrypted',
              target: ['production'],
              projectId: ['other'],
            },
          ]
        : [
            {
              id: 'a3',
              key: 'PREVIEW',
              type: 'encrypted',
              target: ['preview'],
              projectId: ['prj'],
            },
          ];
    assert.equal(String(url).includes('until=7'), page === 2);
    return new Response(
      JSON.stringify({ data, pagination: { next: page === 1 ? 7 : null } })
    );
  };
  const entries = await listSharedEnv({
    token: 't',
    projectId: 'prj',
    fetchImpl,
  });
  assert.deepEqual(
    entries.map(({ key }) => key),
    ['MINE']
  );
});

test('Cloudflare API writes carry values only in bodies and keep other bindings', async () => {
  const secrets = fetchDouble([
    {
      match: '/secrets-bulk',
      method: 'PATCH',
      reply: { body: { success: true, result: { B: { text: VALUE } } } },
    },
  ]);
  await patchSecrets({
    token: 't',
    worker: 'tuturuuu-web-x',
    secrets: { B: VALUE },
    fetchImpl: secrets.fetchImpl,
  });
  assert.equal(leaks(secrets.calls).length, 0);
  assert.deepEqual(JSON.parse(secrets.calls[0].init.body), {
    secrets: { B: { name: 'B', text: VALUE, type: 'secret_text' } },
  });
  const rejected = fetchDouble([
    {
      match: '/secrets-bulk',
      method: 'PATCH',
      reply: {
        status: 400,
        body: { errors: [{ code: 10021, message: VALUE }] },
      },
    },
  ]);
  await assert.rejects(
    patchSecrets({
      token: 't',
      worker: 'tuturuuu-web-x',
      secrets: { B: VALUE },
      fetchImpl: rejected.fetchImpl,
    }),
    (error) =>
      /codes 10021/.test(error.message) && !error.message.includes(VALUE)
  );
  const vars = fetchDouble([
    { match: '/settings', method: 'PATCH', reply: { body: { success: true } } },
  ]);
  await patchVars({
    token: 't',
    worker: 'tuturuuu-web-x',
    current: [
      { name: 'ASSETS', type: 'assets' },
      { name: 'SECRET', type: 'secret_text' },
      { name: 'NEXT_PUBLIC_A', type: 'plain_text', text: 'old' },
    ],
    vars: { NEXT_PUBLIC_A: PUBLIC },
    fetchImpl: vars.fetchImpl,
  });
  const settings = JSON.parse(
    await vars.calls[0].init.body.get('settings').text()
  );
  assert.deepEqual(settings.bindings, [
    { type: 'inherit', name: 'ASSETS' },
    { type: 'inherit', name: 'SECRET' },
    { type: 'plain_text', name: 'NEXT_PUBLIC_A', text: PUBLIC },
  ]);
});

test('cf secrets go through a removed 0600 file with silenced output', () => {
  const seen = {};
  const spawn = (command, args, options) => {
    seen.args = args;
    seen.stdio = options.stdio;
    const file = args.at(-1).slice(1);
    seen.file = file;
    seen.mode = statSync(file).mode & 0o777;
    seen.dirMode = statSync(file.replace(/\/secrets\.json$/, '')).mode & 0o777;
    return { status: seen.fail ? 1 : 0 };
  };
  cfPatchSecrets({
    worker: 'tuturuuu-web-x',
    secrets: { B: VALUE },
    env: {},
    spawn,
  });
  assert.equal(seen.mode, 0o600);
  assert.equal(seen.dirMode, 0o700);
  assert.deepEqual(seen.stdio, ['ignore', 'ignore', 'ignore']);
  assert.ok(!seen.args.join(' ').includes(VALUE));
  assert.throws(() => statSync(seen.file), /ENOENT/);
  seen.fail = true;
  assert.throws(
    () =>
      cfPatchSecrets({
        worker: 'tuturuuu-web-x',
        secrets: { B: VALUE },
        env: {},
        spawn,
      }),
    /bulk-edit on tuturuuu-web-x failed/
  );
  assert.throws(() => statSync(seen.file), /ENOENT/);
});

test('cf binding reads use the latest version and map an absent Worker', () => {
  const versions = [
    { number: 3, bindings: [{ name: 'OLD', type: 'plain_text', text: 'x' }] },
    {
      number: 4,
      bindings: [
        { name: 'NEW', type: 'secret_text' },
        { name: 'V', type: 'plain_text', text: 'y' },
      ],
    },
  ];
  const spawn = () => ({ status: 0, stdout: JSON.stringify(versions) });
  assert.deepEqual(
    cfReadBindings({ worker: 'tuturuuu-web-x', env: {}, spawn }),
    [
      { name: 'NEW', type: 'secret_text' },
      { name: 'V', type: 'plain_text', text: 'y' },
    ]
  );
  const absent = () => ({
    status: 1,
    stdout: '',
    stderr: '[10007] This Worker does not exist',
  });
  assert.equal(
    cfReadBindings({ worker: 'tuturuuu-web-x', env: {}, spawn: absent }),
    null
  );
});

// Run -------------------------------------------------------------------------

function fakes({
  bindings = [{ name: 'ASSETS', type: 'assets' }],
  transport = 'api',
} = {}) {
  const writes = [];
  const reveals = [];
  let current = bindings;
  const api = {
    resolveVercelToken: () => 'vercel-token',
    listProjectEnv: async () => [
      entry('NEXT_PUBLIC_A', 'encrypted'),
      entry('B', 'encrypted'),
      entry('P', 'sensitive'),
    ],
    listSharedEnv: async () => [],
    revealValue: async ({ entry: { key } }) => {
      reveals.push(key);
      return key === 'NEXT_PUBLIC_A' ? PUBLIC : VALUE;
    },
  };
  const cloudflare = {
    transport,
    readBindings: async () => current,
    patchVars:
      transport === 'api'
        ? async ({ vars }) => {
            writes.push(['vars', Object.keys(vars)]);
            current = [
              ...current,
              ...Object.entries(vars).map(([name, text]) => ({
                name,
                type: 'plain_text',
                text,
              })),
            ];
          }
        : null,
    patchSecrets: async ({ secrets }) => {
      writes.push(['secrets', Object.keys(secrets)]);
      current = [
        ...current,
        ...Object.keys(secrets).map((name) => ({ name, type: 'secret_text' })),
      ];
    },
  };
  return { api, cloudflare, writes, reveals };
}

const lines = [];
const deps = (extra) => ({
  env: {},
  log: (line) => lines.push(line),
  readList: () => '["NEXT_PUBLIC_A", "B", "P"]',
  retry: { attempts: 1, delayMs: 0 },
  ...extra,
});

test('a dry run reveals and writes nothing', async () => {
  const { api, cloudflare, writes, reveals } = fakes();
  const plan = await run(
    parseArgs(['--worker', 'tuturuuu-web-x', '--names', 'list']),
    deps({ api, cloudflare })
  );
  assert.deepEqual(reveals, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(
    plan.rows.find((row) => row.name === 'P').status,
    'missing: sensitive in Vercel (not readable)'
  );
});

test('apply writes vars and secrets once and never logs a value', async () => {
  lines.length = 0;
  const { api, cloudflare, writes } = fakes();
  await run(
    parseArgs(['--worker', 'tuturuuu-web-x', '--names', 'list', '--apply']),
    deps({ api, cloudflare })
  );
  assert.deepEqual(writes, [
    ['vars', ['NEXT_PUBLIC_A']],
    ['secrets', ['B']],
  ]);
  assert.ok(
    lines.every((line) => !line.includes(VALUE) && !line.includes(PUBLIC))
  );
});

test('the cf transport needs --vars-out before revealing anything', async () => {
  const { api, cloudflare, reveals } = fakes({ transport: 'cf' });
  await assert.rejects(
    run(
      parseArgs(['--worker', 'tuturuuu-web-x', '--names', 'list', '--apply']),
      deps({ api, cloudflare })
    ),
    /--vars-out/
  );
  assert.deepEqual(reveals, []);
  const files = [];
  const second = fakes({ transport: 'cf' });
  await run(
    parseArgs([
      '--worker',
      'tuturuuu-web-x',
      '--names',
      'list',
      '--apply',
      '--vars-out',
      'vars.json',
    ]),
    deps({
      api: second.api,
      cloudflare: second.cloudflare,
      writeFile: (path, text, options) => files.push({ path, text, options }),
    })
  );
  assert.deepEqual(second.writes, [['secrets', ['B']]]);
  assert.equal(files[0].path, 'vars.json');
  assert.equal(files[0].options.mode, 0o600);
  assert.deepEqual(JSON.parse(files[0].text), { NEXT_PUBLIC_A: PUBLIC });
});

test('apply refuses an absent Worker and bad arguments', async () => {
  const { api, cloudflare } = fakes({ bindings: null });
  await assert.rejects(
    run(
      parseArgs(['--worker', 'tuturuuu-web-x', '--names', 'list', '--apply']),
      deps({ api, cloudflare })
    ),
    /does not exist/
  );
  assert.throws(() => parseArgs(['--worker', 'other-worker']), /tuturuuu-\*/);
  assert.throws(() => parseArgs(['--bogus']), /unknown flag/);
});
