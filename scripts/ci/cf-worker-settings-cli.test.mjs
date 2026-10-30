import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Runs the real CLI entrypoint in a child process. A preloaded stub replaces
// global fetch with real Response objects built from hostile fixtures, and the
// assertions cover the child's complete stdout and stderr.
const CLI = fileURLToPath(new URL('./cf-worker-settings.mjs', import.meta.url));
const BASELINE = fileURLToPath(
  new URL('./fixtures/cf-worker-parity/cron-control.json', import.meta.url)
);
const { identity, previousIdentity = identity } = JSON.parse(
  readFileSync(BASELINE, 'utf8')
);
const TOKEN = 'tok_Ab3dEf5hIj7lMn9pQr1tUv3xYz5bCd7fGh9j';
const HEX = Buffer.from(TOKEN).toString('hex');
const percent = (upper) =>
  [...TOKEN]
    .map((c) => `%${c.charCodeAt(0).toString(16)}`)
    .join('')
    [upper ? 'toUpperCase' : 'toLowerCase']();
// Every form a log reader could decode back into the credential.
const FORMS = [
  TOKEN,
  TOKEN.toLowerCase(),
  Buffer.from(TOKEN).toString('base64'),
  Buffer.from(TOKEN).toString('base64url'),
  HEX,
  HEX.toUpperCase(),
  percent(false),
  percent(true),
  [...TOKEN]
    .map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .join(''),
];
// Values planted into response strings, including DNS-shaped encodings.
const PLANTS = [
  TOKEN,
  `${TOKEN.toLowerCase()}.example.com`,
  `${HEX.slice(0, 40)}.${HEX.slice(40)}.example.com`,
  Buffer.from(TOKEN).toString('base64url'),
];
const ZONE = 'fedcba9876543210fedcba9876543210';
const TOKEN_ID = '0123456789abcdef0123456789abcdef';
const TOKEN_FP = `fp:${createHash('sha256').update(TOKEN_ID).digest('hex').slice(0, 12)}`;

const directory = mkdtempSync(join(tmpdir(), 'cf-worker-settings-cli-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const preload = join(directory, 'hostile-fetch.mjs');
writeFileSync(
  preload,
  `import { readFileSync } from 'node:fs';
const routes = JSON.parse(readFileSync(process.env.HOSTILE_ROUTES, 'utf8'));
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  const key = url.pathname.includes('/workers/services/') ? 'service' : url.pathname.includes('/zones') && !url.pathname.endsWith('/routes')
    ? 'zones'
    : url.pathname.split('/').at(-1);
  const route = routes[key] ?? { status: 404, body: '{}' };
  return new Response(route.body, {
    status: route.status,
    headers: { 'content-type': 'application/json' },
  });
};
`
);

/** A healthy live Worker matching `live`, as raw response bodies. */
function healthy(live) {
  const ok = (result) => ({
    status: 200,
    body: JSON.stringify({ success: true, result }),
  });
  return {
    service: ok({
      default_environment: { script: { last_deployed_from: 'wrangler' } },
    }),
    verify: ok({ id: TOKEN_ID, status: 'active' }),
    settings: ok({
      compatibility_date: live.compatibilityDate,
      compatibility_flags: live.compatibilityFlags,
      observability: {
        enabled: true,
        head_sampling_rate: 0.05,
        traces: { enabled: false, head_sampling_rate: 0.05, persist: true },
      },
      bindings: [
        ...Object.entries(live.vars).map(([name, text]) => ({
          name,
          type: 'plain_text',
          text,
        })),
        ...live.secrets.map((name) => ({ name, type: 'secret_text' })),
        ...Object.entries(live.durableObjects ?? {}).map(([name, object]) => ({
          name,
          type: 'durable_object_namespace',
          class_name: object.className,
        })),
      ],
    }),
    subdomain: ok({ enabled: true, previews_enabled: true }),
    schedules: ok({ schedules: live.crons.map((cron) => ({ cron })) }),
    secrets: ok(live.secrets.map((name) => ({ name }))),
    domains: ok([]),
    zones: ok([{ id: ZONE, name: 'example.com' }]),
    routes: ok([]),
    deployments: ok({
      deployments: [
        { id: 'live', versions: [{ version_id: 'v', percentage: 100 }] },
      ],
    }),
  };
}

function runCli(routes, index) {
  const routesPath = join(directory, `routes-${index}.json`);
  writeFileSync(routesPath, JSON.stringify(routes));
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      pathToFileURL(preload).href,
      CLI,
      'before',
      BASELINE,
      join(directory, `before-${index}.json`),
    ],
    {
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        PATH: process.env.PATH,
        HOSTILE_ROUTES: routesPath,
        CLOUDFLARE_ACCOUNT_ID: identity.accountId,
        CLOUDFLARE_API_TOKEN: TOKEN,
      },
    }
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function assertNoToken(output) {
  // The raw token id is response-derived; only its fingerprint may print.
  assert.ok(!output.includes(TOKEN_ID), 'the raw token id reached output');
  for (const form of FORMS)
    assert.ok(!output.includes(form), 'a token encoding reached output');
  for (const form of FORMS.slice(0, 5))
    for (let start = 0; start + 8 <= form.length; start++)
      assert.ok(
        !output.includes(form.slice(start, start + 8)),
        'an eight-character token fragment reached output'
      );
}

test('the CLI accepts the live identity (harness control)', () => {
  const { status, output } = runCli(healthy(previousIdentity), 0);
  assert.equal(status, 0, output);
  assert.match(
    output,
    new RegExp(
      `Cloudflare API token ${TOKEN_FP} status active \\(user token\\)`
    )
  );
  assert.match(output, /before snapshot verified/);
  assertNoToken(output);
});

const live = healthy(previousIdentity);
const settingsResult = () => JSON.parse(live.settings.body).result;
const settingsWith = (bindings) => ({
  status: 200,
  body: JSON.stringify({
    success: true,
    result: { ...settingsResult(), bindings },
  }),
});
const zonesNamed = (name) => ({
  status: 200,
  body: JSON.stringify({ success: true, result: [{ id: ZONE, name }] }),
});
const ROUTES_FAILED =
  /^Worker settings before check failed: settings snapshot HTTP 403 for GET \/zones\/<zone #1>\/workers\/routes \(codes 10000\)$/m;
for (const [index, [name, changes, pattern]] of [
  [
    'malformed 2xx JSON quoting the token',
    { settings: { status: 200, body: `${TOKEN} is not JSON` } },
    /check failed: settings snapshot returned malformed JSON for GET \/accounts\/[0-9a-f]{32}\/workers\/scripts\/tuturuuu-cron-control\/settings$/m,
  ],
  [
    'malformed routes response led by a token',
    { routes: { status: 200, body: `${TOKEN} is not JSON` } },
    /malformed JSON for GET \/zones\/<zone #1>\/workers\/routes$/m,
  ],
  [
    'malformed routes response led by a hex token',
    { routes: { status: 200, body: `${HEX} not JSON` } },
    /malformed JSON for GET \/zones\/<zone #1>\/workers\/routes$/m,
  ],
  [
    'lowercase token subdomain as a zone name on a routes 403',
    {
      zones: zonesNamed(`${TOKEN.toLowerCase()}.example.com`),
      routes: {
        status: 403,
        body: JSON.stringify({ errors: [{ code: 10000 }] }),
      },
    },
    ROUTES_FAILED,
  ],
  [
    'DNS-shaped hex token as a zone name on a routes 403',
    {
      zones: zonesNamed(`${HEX.slice(0, 40)}.${HEX.slice(40)}.example.com`),
      routes: {
        status: 403,
        body: JSON.stringify({ errors: [{ code: 10000 }] }),
      },
    },
    ROUTES_FAILED,
  ],
  [
    'token as a zone id',
    {
      zones: {
        status: 200,
        body: JSON.stringify({
          success: true,
          result: [{ id: TOKEN, name: 'example.com' }],
        }),
      },
    },
    /zone list returned an invalid id for zone #1$/m,
  ],
  [
    'token id hex-encoding a 16-byte token prefix',
    {
      verify: {
        status: 200,
        body: JSON.stringify({
          success: true,
          result: {
            id: Buffer.from(TOKEN.slice(0, 16)).toString('hex'),
            status: 'active',
          },
        }),
      },
      routes: {
        status: 403,
        body: JSON.stringify({ errors: [{ code: 10000 }] }),
      },
    },
    new RegExp(
      `^Cloudflare API token fp:${createHash('sha256')
        .update(Buffer.from(TOKEN.slice(0, 16)).toString('hex'))
        .digest('hex')
        .slice(0, 12)} status active \\(user token\\)$`,
      'm'
    ),
  ],
  [
    'token echoed in verify fields and error bodies',
    {
      verify: {
        status: 200,
        body: JSON.stringify({ result: { id: TOKEN, status: HEX } }),
      },
      routes: {
        status: 403,
        body: JSON.stringify({
          success: false,
          errors: [{ code: TOKEN, message: TOKEN }, { code: 9109 }],
          messages: [TOKEN],
        }),
      },
    },
    /HTTP 403 for GET \/zones\/<zone #1>\/workers\/routes \(codes 9109\)$/m,
  ],
  [
    'identifier-shaped and base64url binding names',
    {
      settings: settingsWith([
        ...settingsResult().bindings,
        ...[TOKEN, Buffer.from(TOKEN).toString('base64url')].map((name) => ({
          name,
          type: 'plain_text',
          text: TOKEN,
        })),
      ]),
    },
    /undeclared plain_text binding <undeclared binding #\d+>/,
  ],
  [
    'prototype-shaped binding names',
    {
      settings: settingsWith([
        ...settingsResult().bindings,
        { name: '__proto__', type: 'plain_text', text: TOKEN },
      ]),
    },
    /undeclared plain_text binding <undeclared binding #\d+>/,
  ],
].entries())
  test(`hostile fixture: ${name} never prints the token`, () => {
    const { status, output } = runCli({ ...live, ...changes }, index + 1);
    assert.equal(status, 1, `${name}: ${output}`);
    assert.match(output, pattern, name);
    assertNoToken(output);
  });

/** Every string leaf of a JSON value, as [path, setter-on-clone] pairs. */
function stringLeaves(value, path = []) {
  if (typeof value === 'string') return [path];
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, item]) =>
      stringLeaves(item, [...path, key])
    );
  return [];
}
function plant(routes, endpoint, path, value) {
  const body = JSON.parse(routes[endpoint].body);
  let target = body;
  for (const key of path.slice(0, -1)) target = target[key];
  target[path.at(-1)] = value;
  return {
    ...routes,
    [endpoint]: { ...routes[endpoint], body: JSON.stringify(body) },
  };
}
const LEAVES = Object.keys(live).flatMap((endpoint) =>
  stringLeaves(JSON.parse(live[endpoint].body)).map((path) => [endpoint, path])
);
// Strings the gate does not compare: they must still never be printed, and
// poisoning one alone may pass. Every other string must fail the gate closed.
const UNGATED = new Set([
  // Printed only as a fingerprint of a 32-hex id (`fp:<12 hex>`).
  'verify/result.id',
  'verify/result.status',
  'zones/result.0.name',
  'deployments/result.deployments.0.id',
  'deployments/result.deployments.0.versions.0.version_id',
  ...previousIdentity.secrets.map(
    (_, index) =>
      `settings/result.bindings.${Object.keys(previousIdentity.vars).length + index}.name`
  ),
]);

test('every string field of every response, poisoned, never reaches output', () => {
  assert.ok(LEAVES.length >= 15, 'fixture exposes its string fields');
  const keys = new Set(
    LEAVES.map(([endpoint, path]) => `${endpoint}/${path.join('.')}`)
  );
  for (const key of UNGATED) assert.ok(keys.has(key), `unknown field ${key}`);
  let run = 100;
  for (const value of PLANTS) {
    // All strings at once: the gate must fail closed.
    let everything = live;
    for (const [endpoint, path] of LEAVES)
      everything = plant(everything, endpoint, path, value);
    const all = runCli(everything, run++);
    assert.equal(all.status, 1, all.output);
    assertNoToken(all.output);
    // One string at a time: never printed; gated fields fail closed.
    for (const [endpoint, path] of LEAVES) {
      const key = `${endpoint}/${path.join('.')}`;
      const { status, output } = runCli(
        plant(live, endpoint, path, value),
        run++
      );
      assertNoToken(output);
      assert.equal(status, UNGATED.has(key) ? 0 : 1, `${key}: ${output}`);
    }
  }
});
