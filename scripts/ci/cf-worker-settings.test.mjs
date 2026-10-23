import assert from 'node:assert/strict';
import test from 'node:test';
import { captureSettings, compareSettings } from './cf-worker-settings.mjs';

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
