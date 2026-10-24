import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
const { identity, previousIdentity } = JSON.parse(
  readFileSync(BASELINE, 'utf8')
);
const TOKEN = 'tok_Ab3dEf5hIj7lMn9pQr1tUv3xYz5bCd7fGh9j';
const FORMS = [
  TOKEN,
  Buffer.from(TOKEN).toString('base64'),
  Buffer.from(TOKEN).toString('base64url'),
  [...TOKEN].map((c) => `%${c.charCodeAt(0).toString(16)}`).join(''),
  [...TOKEN]
    .map((c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .join(''),
  [...TOKEN]
    .map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .join(''),
];
const echo = FORMS.join(' ');
const ZONE = 'fedcba9876543210fedcba9876543210';
const TOKEN_ID = '0123456789abcdef0123456789abcdef';

const directory = mkdtempSync(join(tmpdir(), 'cf-worker-settings-cli-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const preload = join(directory, 'hostile-fetch.mjs');
writeFileSync(
  preload,
  `import { readFileSync } from 'node:fs';
const routes = JSON.parse(readFileSync(process.env.HOSTILE_ROUTES, 'utf8'));
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  const key = url.pathname.includes('/zones') && !url.pathname.endsWith('/routes')
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
    verify: ok({ id: TOKEN_ID, status: 'active' }),
    settings: ok({
      compatibility_date: live.compatibilityDate,
      compatibility_flags: live.compatibilityFlags,
      observability: { enabled: true, head_sampling_rate: 0.05 },
      bindings: [
        ...Object.entries(live.vars).map(([name, text]) => ({
          name,
          type: 'plain_text',
          text,
        })),
        ...live.secrets.map((name) => ({ name, type: 'secret_text' })),
      ],
    }),
    subdomain: ok({ enabled: true, previews_enabled: true }),
    schedules: ok({ schedules: live.crons.map((cron) => ({ cron })) }),
    secrets: ok(live.secrets.map((name) => ({ name }))),
    domains: ok([]),
    zones: ok([{ id: ZONE, name: 'example.com' }]),
    routes: ok([]),
    deployments: ok({ deployments: [{ id: 'live', versions: [] }] }),
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
  for (const form of FORMS)
    assert.ok(!output.includes(form), 'a token encoding reached output');
  for (const form of FORMS.slice(0, 3))
    for (let start = 0; start + 8 <= form.length; start++)
      assert.ok(
        !output.includes(form.slice(start, start + 8)),
        'an eight-character token fragment reached output'
      );
}

test('the CLI accepts the live previous identity (harness control)', () => {
  const { status, output } = runCli(healthy(previousIdentity), 0);
  assert.equal(status, 0, output);
  assert.match(
    output,
    new RegExp(`Cloudflare API token id ${TOKEN_ID} status active`)
  );
  assert.match(output, /before snapshot verified \(previous identity\)/);
  assertNoToken(output);
});

const live = healthy(previousIdentity);
const settingsWith = (bindings) => ({
  status: 200,
  body: JSON.stringify({
    success: true,
    result: {
      ...JSON.parse(live.settings.body).result,
      bindings: [
        ...JSON.parse(live.settings.body).result.bindings,
        ...bindings,
      ],
    },
  }),
});
for (const [index, [name, changes, pattern]] of [
  [
    'malformed 2xx JSON quoting the token',
    // V8's SyntaxError quotes the start of a body like this one.
    { settings: { status: 200, body: `${TOKEN} is not JSON` } },
    /check failed: settings snapshot returned malformed JSON for GET \/accounts\/[0-9a-f]{32}\/workers\/scripts\/tuturuuu-cron-control\/settings$/m,
  ],
  [
    'malformed token-verify JSON and error text',
    {
      verify: { status: 200, body: `${TOKEN} not json` },
      settings: {
        status: 403,
        body: JSON.stringify({ errors: [{ code: 10000, message: echo }] }),
      },
    },
    /settings snapshot HTTP 403 for GET .*\/settings \(codes 10000\)$/m,
  ],
  [
    'token echoed in verify fields and error bodies',
    {
      verify: {
        status: 200,
        body: JSON.stringify({ result: { id: echo, status: echo } }),
      },
      routes: {
        status: 403,
        body: JSON.stringify({
          success: false,
          errors: [{ code: echo, message: echo }, { code: 9109 }],
          messages: [echo],
        }),
      },
    },
    /HTTP 403 for GET \/zones\/[0-9a-f]{32}\/workers\/routes \(zone example\.com\) \(codes 9109\)$/m,
  ],
  [
    'identifier-shaped and base64url binding names',
    {
      settings: settingsWith(
        [TOKEN, Buffer.from(TOKEN).toString('base64url')].map((name) => ({
          name,
          type: 'plain_text',
          text: echo,
        }))
      ),
    },
    /Worker vars differ: <undeclared binding #\d+>, <undeclared binding #\d+>/,
  ],
  [
    'token-bearing binding type and attribute',
    {
      settings: settingsWith([
        { name: TOKEN, type: TOKEN },
        { name: 'WEB_ORIGIN', type: 'plain_text', text: 'x', [TOKEN]: echo },
      ]),
    },
    /unreviewed <unknown type> binding <undeclared binding #\d+>|unreviewed <unknown attribute>/,
  ],
  [
    'token-bearing zone name and crons',
    {
      zones: {
        status: 200,
        body: JSON.stringify({
          success: true,
          result: [{ id: ZONE, name: echo }],
        }),
      },
      schedules: {
        status: 200,
        body: JSON.stringify({
          success: true,
          result: { schedules: [{ cron: echo }] },
        }),
      },
    },
    /cron schedules differ/,
  ],
].entries())
  test(`hostile fixture: ${name} never prints the token`, () => {
    const { status, output } = runCli({ ...live, ...changes }, index + 1);
    assert.equal(status, 1, `${name}: ${output}`);
    assert.match(output, pattern, name);
    assertNoToken(output);
  });
