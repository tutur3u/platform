import assert from 'node:assert/strict';
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
function fixture(overrides = {}) {
  const responses = {
    settings: {
      compatibility_date: identity.compatibilityDate,
      observability: { enabled: true, head_sampling_rate: 0.05 },
      bindings: [
        { name: 'ORIGIN', type: 'plain_text', text: 'private-fixture-value' },
      ],
    },
    subdomain: { enabled: true, previews_enabled: true },
    schedules: { schedules: [{ cron: '*/5 * * * *' }] },
    secrets: [{ name: 'TOKEN' }],
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
const options = (api) => ({
  identity,
  accountId: identity.accountId,
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

test('a denied request prints only status, numeric codes, path and zone', async () => {
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
        `settings snapshot HTTP 403 for GET /zones/${ZONE}/workers/routes ` +
          '(zone example.com) (codes 10000)'
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
  assert.equal(outputs[3], 'zone list returned an invalid id');
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
    'Cloudflare API token id unrecognized status unrecognized (user token)',
    'Cloudflare API token could not be verified: user HTTP 401 (codes 1000); ' +
      'account HTTP 401 (codes 1000)',
    'Cloudflare API token could not be verified: user error; account error',
  ]);
  assertNoServerText([...outputs, ...lines]);
});

test('token diagnostics print a well-formed token id and status', async () => {
  const lines = [];
  const id = 'fedcba9876543210fedcba9876543210';
  const calls = [];
  const description = await describeToken({
    accountId: 'fixture-account',
    token: TOKEN,
    log: (line) => lines.push(line),
    fetchImpl: async (url, init) => {
      assert.equal(init.method, 'GET');
      calls.push(url);
      return url.includes('/user/')
        ? reject(401, { errors: [{ code: 1000 }] })
        : {
            ok: true,
            json: async () => ({
              success: true,
              result: { id, status: 'active' },
            }),
          };
    },
  });
  assert.deepEqual(description, { owner: 'account', id, status: 'active' });
  assert.deepEqual(lines, [
    `Cloudflare API token id ${id} status active (account token)`,
  ]);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].endsWith('/accounts/fixture-account/tokens/verify'));
});
