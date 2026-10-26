import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  captureSettings,
  compareSettings,
  describeToken,
} from './cf-worker-settings.mjs';

const identity = {
  name: 'fixture',
  accountId: 'fixture-account',
  workersDev: true,
  previewUrls: true,
  compatibilityDate: '2026-09-28',
  compatibilityFlags: [],
  crons: ['*/5 * * * *'],
  secrets: ['TOKEN'],
  routes: [],
  observability: {
    enabled: true,
    headSamplingRate: 0.05,
    logs: { enabled: true, headSamplingRate: 0.05, invocationLogs: true },
  },
};
function fixture(overrides = {}, target = identity) {
  const responses = {
    settings: {
      compatibility_date: target.compatibilityDate,
      compatibility_flags: target.compatibilityFlags,
      observability: { enabled: true, head_sampling_rate: 0.05 },
      bindings: [
        { name: 'ORIGIN', type: 'plain_text', text: 'private-fixture-value' },
      ],
    },
    subdomain: { enabled: true, previews_enabled: true },
    schedules: { schedules: target.crons.map((cron) => ({ cron })) },
    secrets: target.secrets.map((name) => ({ name })),
    domains: [],
    zones: [],
    deployments: {
      deployments: [
        { id: 'before', versions: [{ version_id: 'old', percentage: 100 }] },
      ],
    },
    ...overrides,
  };
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal instanceof AbortSignal);
      calls.push(url);
      const key = url.includes('/zones?') ? 'zones' : url.split('/').at(-1);
      assert.ok(Object.hasOwn(responses, key), `unexpected endpoint ${url}`);
      return {
        ok: true,
        json: async () => ({ success: true, result: responses[key] }),
      };
    },
  };
}
const options = (api, target = identity) => ({
  identity: target,
  accountId: target.accountId,
  token: 'disposable-fixture',
  fetchImpl: api.fetchImpl,
});

test('settings readback retains rollback identity, compares settings, and omits text values', async () => {
  const api = fixture();
  const before = await captureSettings(options(api));
  assert.equal(api.calls.length, 7);
  assert.equal(before.rollback[0].versions[0].version_id, 'old');
  assert.ok(!JSON.stringify(before).includes('private-fixture-value'));
  const after = structuredClone(before);
  after.rollback[0].id = 'after';
  compareSettings(before, after);
  after.settingsHash = 'changed';
  assert.throws(() => compareSettings(before, after), /acceptance is blocked/);
});

test('account mismatch fails before network access', async () => {
  const api = fixture();
  await assert.rejects(
    captureSettings({ ...options(api), accountId: 'other' }),
    /account/
  );
  assert.equal(api.calls.length, 0);
});

test('object snapshots tolerate list metadata without discarding object fields', async () => {
  const api = fixture();
  const expected = await captureSettings(options(api));
  const fetchImpl = async (url, init) => {
    const response = await api.fetchImpl(url, init);
    const body = await response.json();
    if (!Array.isArray(body.result) && !url.endsWith('/deployments'))
      body.result_info = { page: 1, per_page: 20, total_pages: 2 };
    return { ok: true, json: async () => body };
  };
  assert.deepEqual(
    await captureSettings({ ...options(api), fetchImpl }),
    expected
  );
});

function paginated(endpoint, pages, metadata = {}, field) {
  const api = fixture();
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      const parsed = new URL(url);
      if (!parsed.pathname.endsWith(endpoint)) return api.fetchImpl(url, init);
      assert.equal(init.redirect, 'error');
      assert.equal(init.method, 'GET');
      calls.push(parsed);
      const page = Number(parsed.searchParams.get('page') ?? 1);
      return {
        ok: true,
        json: async () => ({
          success: true,
          result: field ? { [field]: pages[page - 1] } : pages[page - 1],
          result_info: {
            page,
            per_page: 1,
            total_pages: pages.length,
            ...metadata,
          },
        }),
      };
    },
  };
}

test('snapshot reads all secret pages before verifying required names', async () => {
  const api = paginated('/secrets', [[{ name: 'EXTRA' }], [{ name: 'TOKEN' }]]);
  const snapshot = await captureSettings(options(api));
  assert.deepEqual(snapshot.secrets, ['EXTRA', 'TOKEN']);
  assert.deepEqual(
    api.calls.map((url) => url.searchParams.get('page')),
    [null, '2']
  );
});

test('a custom domain hidden on page two still blocks publication', async () => {
  const api = paginated('/domains', [
    [{ service: 'other' }],
    [{ service: 'fixture', hostname: 'private.example' }],
  ]);
  await assert.rejects(
    captureSettings(options(api)),
    /unexpected Worker custom domains/
  );
  assert.equal(api.calls.length, 2);
});

test('twenty pages of deployment history retain only the current traffic split', async () => {
  const api = paginated(
    '/deployments',
    [
      [
        {
          id: 'current',
          versions: [
            { version_id: 'current-version', percentage: 75 },
            { version_id: 'canary-version', percentage: 25 },
          ],
        },
      ],
      [
        {
          id: 'previous',
          versions: [{ version_id: 'previous-version', percentage: 100 }],
        },
      ],
    ],
    { total_pages: 20 },
    'deployments'
  );
  const snapshot = await captureSettings(options(api));
  assert.deepEqual(snapshot.rollback, [
    {
      id: 'current',
      versions: [
        { percentage: 25, version_id: 'canary-version' },
        { percentage: 75, version_id: 'current-version' },
      ],
    },
  ]);
  assert.equal(api.calls.length, 1);
});

for (const history of [
  [],
  [null],
  [{ id: 'missing-versions' }],
  [{ id: 'invalid-split', versions: [{ version_id: 'v', percentage: 90 }] }],
]) {
  test(`unavailable active deployment fails closed: ${JSON.stringify(history)}`, async () => {
    const api = paginated(
      '/deployments',
      [history],
      { total_pages: 20 },
      'deployments'
    );
    await assert.rejects(
      captureSettings(options(api)),
      /active deployment rollback target unavailable for GET/
    );
    assert.equal(api.calls.length, 1);
  });
}

test('a non-first deployment page is not accepted as current state', async () => {
  const api = paginated(
    '/deployments',
    [[{ id: 'history', versions: [{ version_id: 'v', percentage: 100 }] }]],
    { page: 2, total_pages: 20 },
    'deployments'
  );
  await assert.rejects(
    captureSettings(options(api)),
    /active deployment rollback target unavailable/
  );
});

for (const [label, pages, metadata, error] of [
  [
    'page budget',
    [[{ name: 'TOKEN' }]],
    { total_pages: 9 },
    /page budget exceeded/,
  ],
  [
    'repeated page',
    [[{ name: 'TOKEN' }], [{ name: 'TOKEN' }]],
    {},
    /repeated a page/,
  ],
  [
    'wrong page',
    [[{ name: 'TOKEN' }], [{ name: 'EXTRA' }]],
    { page: 1 },
    /did not advance/,
  ],
  [
    'invalid metadata',
    [[{ name: 'TOKEN' }]],
    { total_pages: 'private-canary' },
    /invalid pagination/,
  ],
  [
    'truncated count',
    [[{ name: 'TOKEN' }]],
    { total_count: 2 },
    /total count differs/,
  ],
]) {
  test(`list pagination rejects ${label} with a safe endpoint diagnostic`, async () => {
    const api = paginated('/secrets', pages, metadata);
    await assert.rejects(captureSettings(options(api)), (failure) => {
      assert.match(failure.message, error);
      assert.match(
        failure.message,
        /GET \/accounts\/fixture-account\/workers\/scripts\/fixture\/secrets$/
      );
      assert.ok(!failure.message.includes('private-canary'));
      return true;
    });
    assert.ok(api.calls.length <= 2);
  });
}

test('pagination preserves the shared 28-request snapshot budget', async () => {
  const zones = Array.from({ length: 20 }, (_, index) => ({
    id: index.toString(16).padStart(32, '0'),
  }));
  const api = fixture({ zones });
  const secrets = paginated('/secrets', [
    [{ name: 'A' }],
    [{ name: 'B' }],
    [{ name: 'TOKEN' }],
  ]);
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    if (new URL(url).pathname.endsWith('/secrets'))
      return secrets.fetchImpl(url, init);
    if (url.endsWith('/workers/routes'))
      return { ok: true, json: async () => ({ success: true, result: [] }) };
    return api.fetchImpl(url, init);
  };
  await assert.rejects(
    captureSettings({ ...options(api), fetchImpl }),
    /request budget exceeded for GET/
  );
  assert.equal(calls, 28);
});

for (const [label, change, error] of [
  [
    'preview',
    { subdomain: { enabled: true, previews_enabled: false } },
    /preview/,
  ],
  [
    'logs',
    {
      settings: {
        compatibility_date: identity.compatibilityDate,
        observability: {
          enabled: true,
          head_sampling_rate: 0.05,
          logs: { invocation_logs: false },
        },
      },
    },
    /logs/,
  ],
  ['secret', { secrets: [] }, /missing declared secret/],
  [
    'domain',
    { domains: [{ service: 'fixture', hostname: 'unexpected.example' }] },
    /custom domains/,
  ],
  [
    'zones',
    { zones: Array.from({ length: 21 }, (_, n) => ({ id: String(n) })) },
    /at most 20/,
  ],
])
  test(`${label} drift or unsupported scope blocks publication`, async () => {
    await assert.rejects(captureSettings(options(fixture(change))), error);
  });

test('API failure and pagination fail closed without replay', async () => {
  let calls = 0;
  for (const body of [
    { success: false },
    { success: true, result_info: { total_pages: 2 } },
  ]) {
    await assert.rejects(
      captureSettings({
        ...options(fixture()),
        fetchImpl: async () => {
          calls++;
          return { ok: true, json: async () => body };
        },
      })
    );
  }
  assert.equal(calls, 2);
});

const ZONE = '0123456789abcdef0123456789abcdef';
const TOKEN = 'Echo_Token-QwErTyUiOpAsDfGhJkLzXcVbNm_98';
// Every form a log reader could decode back into the credential.
const TOKEN_FORMS = [
  TOKEN,
  [...TOKEN]
    .map((c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .join(''),
  [...TOKEN].map((c) => `%${c.charCodeAt(0).toString(16)}`).join(''),
  [...TOKEN]
    .map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .join(''),
];
const CANARY = 'SERVER-CANARY';
const echo = TOKEN_FORMS.map((form) => `${CANARY} ${form}`).join(' ');
const reject = (status, body) => ({
  ok: false,
  status,
  json: async () => body,
});

function assertNoServerText(outputs) {
  const text = outputs.join('\n');
  assert.ok(!text.includes(CANARY), 'server-provided text reached output');
  for (const form of TOKEN_FORMS)
    assert.ok(!text.includes(form), 'a token encoding reached output');
  for (let start = 0; start + 8 <= TOKEN.length; start++)
    assert.ok(!text.includes(TOKEN.slice(start, start + 8)));
}

test('a denied request prints only status, numeric codes and a zone ordinal', async () => {
  const api = fixture({ zones: [{ id: ZONE, name: 'example.com' }] });
  const denied = async (url, init) =>
    url.endsWith('/workers/routes')
      ? reject(403, {
          success: false,
          errors: [
            { code: 10000, message: echo },
            { code: echo, message: echo },
          ],
          messages: [echo],
        })
      : api.fetchImpl(url, init);
  await assert.rejects(
    captureSettings({ ...options(api), token: TOKEN, fetchImpl: denied }),
    (error) => {
      assert.equal(
        error.message,
        'settings snapshot HTTP 403 for GET /zones/<zone #1>/workers/routes ' +
          '(codes 10000)'
      );
      return true;
    }
  );
});

test('no server-provided string reaches output in any token encoding', async () => {
  const outputs = [];
  const capture = async (overrides, fetchWrap) => {
    const api = fixture(overrides);
    try {
      await captureSettings({
        ...options(api),
        token: TOKEN,
        fetchImpl: fetchWrap ? fetchWrap(api) : api.fetchImpl,
      });
      assert.fail('expected the snapshot to fail closed');
    } catch (error) {
      outputs.push(error.message);
    }
  };
  // HTTP failure and success:false bodies echoing the token.
  await capture(
    {},
    () => async () =>
      reject(401, { errors: [{ code: 1000, message: echo }], result: echo })
  );
  await capture({}, () => async () => ({
    ok: true,
    json: async () => ({
      success: false,
      errors: [{ code: 7003, message: echo }],
    }),
  }));
  // Server identifiers carrying the token: zone name, zone id, bindings, crons.
  await capture(
    { zones: [{ id: ZONE, name: echo }] },
    (api) => async (url, init) =>
      url.endsWith('/workers/routes')
        ? reject(403, { errors: [{ code: 10000 }] })
        : api.fetchImpl(url, init)
  );
  await capture({ zones: [{ id: TOKEN, name: 'example.com' }] });
  await capture({ schedules: { schedules: [{ cron: echo }] } });
  await capture({
    settings: {
      compatibility_date: echo,
      observability: { enabled: true, head_sampling_rate: 0.05 },
    },
  });
  await capture({
    domains: [{ service: 'fixture', hostname: echo }],
  });
  for (const outcome of outputs) assert.match(outcome, /\S/);
  assert.match(
    outputs[0],
    /^settings snapshot HTTP 401 for GET .* \(codes 1000\)$/
  );
  assert.match(outputs[1], /API failed for GET .* \(codes 7003\)$/);
  assert.match(outputs[2], /workers\/routes \(codes 10000\)$/);
  assert.equal(outputs[3], 'zone list returned an invalid id for zone #1');
  assert.equal(outputs[4], 'cron schedules differ');
  assert.equal(outputs[5], 'compatibility date differs');
  assert.equal(outputs[6], 'unexpected Worker custom domains');

  const lines = [];
  const base = {
    accountId: 'fixture-account',
    token: TOKEN,
    log: (line) => lines.push(line),
  };
  await describeToken({
    ...base,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ success: true, result: { id: echo, status: echo } }),
    }),
  });
  await describeToken({
    ...base,
    fetchImpl: async () =>
      reject(401, { errors: [{ code: 1000, message: echo }, { code: echo }] }),
  });
  await describeToken({
    ...base,
    fetchImpl: async () => {
      const error = new Error(echo);
      error.name = echo;
      throw error;
    },
  });
  assert.deepEqual(lines, [
    'Cloudflare API token fp:<invalid> status unrecognized (user token)',
    'Cloudflare API token could not be verified: user HTTP 401 (codes 1000); ' +
      'account HTTP 401 (codes 1000)',
    'Cloudflare API token could not be verified: user error; account error',
  ]);
  assertNoServerText([...outputs, ...lines]);
});

const fingerprint = (id) =>
  `fp:${createHash('sha256').update(id).digest('hex').slice(0, 12)}`;

function verifiedAs(result) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      assert.equal(init.method, 'GET');
      calls.push(url);
      return url.includes('/user/')
        ? reject(401, { errors: [{ code: 1000 }] })
        : { ok: true, json: async () => ({ success: true, result }) };
    },
  };
}

test('token diagnostics print a fingerprint of the id, never the id', async () => {
  const lines = [];
  const id = 'fedcba9876543210fedcba9876543210';
  const api = verifiedAs({ id, status: 'active' });
  const description = await describeToken({
    accountId: 'fixture-account',
    token: TOKEN,
    log: (line) => lines.push(line),
    fetchImpl: api.fetchImpl,
  });
  assert.deepEqual(description, {
    owner: 'account',
    fingerprint: fingerprint(id),
    status: 'active',
  });
  assert.match(fingerprint(id), /^fp:[0-9a-f]{12}$/);
  assert.deepEqual(lines, [
    `Cloudflare API token ${fingerprint(id)} status active (account token)`,
  ]);
  assert.ok(!JSON.stringify([description, lines]).includes(id));
  assert.equal(api.calls.length, 2);
  assert.ok(api.calls[1].endsWith('/accounts/fixture-account/tokens/verify'));
});

test('a token id hex-encoding a token prefix is printed only as a fingerprint', async () => {
  // A well-formed id that is the hex of the token's first 16 bytes.
  const prefix = TOKEN.slice(0, 16);
  const id = Buffer.from(prefix).toString('hex');
  assert.match(id, /^[0-9a-f]{32}$/);
  const lines = [];
  const description = await describeToken({
    accountId: 'fixture-account',
    token: TOKEN,
    log: (line) => lines.push(line),
    fetchImpl: verifiedAs({ id, status: 'active' }).fetchImpl,
  });
  const text = JSON.stringify([description, lines]);
  for (const form of [id, id.toUpperCase(), prefix, prefix.slice(0, 8)])
    assert.ok(!text.includes(form), 'the id or its token prefix was printed');
  for (let start = 0; start + 8 <= id.length; start++)
    assert.ok(!text.includes(id.slice(start, start + 8)));
  assert.deepEqual(lines, [
    `Cloudflare API token ${fingerprint(id)} status active (account token)`,
  ]);
});
const coordination = JSON.parse(
  readFileSync(
    new URL('./fixtures/cf-worker-parity/coordination.json', import.meta.url),
    'utf8'
  )
).identity;

test('Coordination snapshots retain the required token with one bounded secret read per phase', async () => {
  assert.deepEqual(coordination.secrets, ['COORDINATION_TOKEN']);
  const snapshots = [];
  for (const phase of ['before', 'after']) {
    const api = fixture({}, coordination);
    const snapshot = await captureSettings(options(api, coordination));
    assert.deepEqual(snapshot.secrets, ['COORDINATION_TOKEN'], phase);
    assert.equal(
      api.calls.filter((url) => url.endsWith('/secrets')).length,
      1,
      phase
    );
    assert.equal(api.calls.length, 7, phase);
    assert.equal(
      api.calls.find((url) => url.endsWith('/secrets')),
      `https://api.cloudflare.com/client/v4/accounts/${coordination.accountId}/workers/scripts/${coordination.name}/secrets`,
      phase
    );
    assert.ok(
      api.calls.every((url) => url.includes(coordination.accountId)),
      phase
    );
    snapshots.push(snapshot);
  }
  compareSettings(snapshots[0], snapshots[1]);
});

for (const phase of ['before', 'after']) {
  test(`Coordination ${phase} snapshot rejects a missing token`, async () => {
    const api = fixture({ secrets: [] }, coordination);
    await assert.rejects(
      captureSettings(options(api, coordination)),
      /missing declared secret COORDINATION_TOKEN/
    );
    assert.equal(api.calls.filter((url) => url.endsWith('/secrets')).length, 1);
  });
}
