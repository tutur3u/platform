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

test('a denied request names its path and zone without printing the token', async () => {
  const api = fixture({ zones: [{ id: 'zone-1', name: 'example.com' }] });
  const denied = async (url, init) => {
    if (!url.endsWith('/workers/routes')) return api.fetchImpl(url, init);
    return {
      ok: false,
      status: 403,
      json: async () => ({
        success: false,
        errors: [{ code: 10000, message: 'Authentication error' }],
      }),
    };
  };
  await assert.rejects(
    captureSettings({ ...options(api), fetchImpl: denied }),
    (error) => {
      assert.equal(
        error.message,
        'settings snapshot HTTP 403 for GET /zones/zone-1/workers/routes ' +
          '(zone example.com) (10000: Authentication error)'
      );
      assert.ok(!error.message.includes('disposable-fixture'));
      return true;
    }
  );
});

test('token diagnostics log the token id and status, never the token', async () => {
  const lines = [];
  const calls = [];
  const respond = (byPath) => async (url, init) => {
    assert.equal(init.method, 'GET');
    calls.push(url.replace('https://api.cloudflare.com/client/v4', ''));
    const result = byPath[calls.at(-1)];
    return result
      ? { ok: true, json: async () => ({ success: true, result }) }
      : {
          ok: false,
          status: 401,
          json: async () => ({ errors: [{ code: 1000, message: 'Invalid' }] }),
        };
  };
  const base = {
    accountId: 'fixture-account',
    token: 'disposable-fixture',
    log: (line) => lines.push(line),
  };
  assert.deepEqual(
    await describeToken({
      ...base,
      fetchImpl: respond({
        '/user/tokens/verify': { id: 'user-token', status: 'active' },
      }),
    }),
    { owner: 'user', id: 'user-token', status: 'active' }
  );
  assert.deepEqual(
    await describeToken({
      ...base,
      fetchImpl: respond({
        '/accounts/fixture-account/tokens/verify': {
          id: 'account-token',
          status: 'active',
        },
      }),
    }),
    { owner: 'account', id: 'account-token', status: 'active' }
  );
  assert.equal(await describeToken({ ...base, fetchImpl: respond({}) }), null);
  assert.deepEqual(lines, [
    'Cloudflare API token id user-token status active (user token)',
    'Cloudflare API token id account-token status active (account token)',
    'Cloudflare API token could not be verified: user HTTP 401 (1000: Invalid); ' +
      'account HTTP 401 (1000: Invalid)',
  ]);
  assert.equal(calls.length, 5);
  assert.ok(!lines.join('\n').includes('disposable-fixture'));
});
