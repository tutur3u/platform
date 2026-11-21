import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeT3Accounting, normalizeT3Quota } from './usage-normalize.mjs';

const NOW = new Date('2026-11-21T11:30:00.000Z');
const PROVIDER = {
  instanceId: 'codex-work',
  driver: 'codex',
  displayName: 'Work @ owner@example.com',
  enabled: true,
  installed: true,
  auth: {
    status: 'authenticated',
    label: 'ChatGPT Plus Subscription',
    email: 'owner@example.com',
    endpoint: 'https://private.example.com/',
  },
  usageLimits: {
    checkedAt: '2026-11-21T18:29:00+07:00',
    credentialFingerprint: 'private-marker',
    windows: [
      {
        kind: 'session',
        usedPercent: 88,
        resetsAt: '2026-11-21T19:00:00+07:00',
      },
      { kind: 'session', usedPercent: 100, modelIds: ['gpt-5.5'] },
      { kind: 'weekly', usedPercent: 100 },
    ],
  },
};

test('projects only authenticated identity and account-wide quota', () => {
  const result = normalizeT3Quota({ providers: [PROVIDER] }, NOW);
  const [account] = result.accounts;
  assert.deepEqual(result.quota, {
    kind: 'complete',
    observedAt: NOW.toISOString(),
  });
  assert.equal(account.email, 'owner@example.com');
  assert.equal(account.plan, 'ChatGPT Plus Subscription');
  assert.equal(account.checkedAt, '2026-11-21T11:29:00.000Z');
  assert.deepEqual(account.status, { kind: 'limited', reason: 'weekly' });
  assert.deepEqual(account.windows, [
    { kind: 'session', usedPercent: 88, resetsAt: '2026-11-21T12:00:00.000Z' },
    { kind: 'weekly', usedPercent: 100, resetsAt: null },
  ]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-marker|private\.example/
  );
  assert.doesNotMatch(account.instance, /owner@example/);
});

test('keeps missing, unauthenticated and unsupported measurements distinct', () => {
  assert.deepEqual(normalizeT3Quota(null, NOW), {
    quota: { kind: 'unavailable' },
    accounts: [],
  });
  const { accounts } = normalizeT3Quota(
    {
      providers: [
        { ...PROVIDER, auth: { ...PROVIDER.auth, status: 'unauthenticated' } },
        {
          ...PROVIDER,
          instanceId: 'unsupported',
          usageLimits: { unavailable: { reason: 'unsupported' } },
        },
      ],
    },
    NOW
  );
  assert.equal(accounts[0].email, null);
  assert.deepEqual(
    accounts.map((account) => account.status),
    [
      { kind: 'unknown', reason: 'not_authenticated' },
      { kind: 'unknown', reason: 'unsupported' },
    ]
  );
});

test('preserves missing prices and partial coverage without exposing scan paths', () => {
  const result = normalizeT3Accounting({
    readAt: NOW.toISOString(),
    sources: [
      {
        status: 'ok',
        fingerprint: { resolvedHomePath: '/private/provider/store' },
      },
      { status: 'partial' },
    ],
    buckets: [
      {
        day: '2026-11-21',
        provider: 'codex',
        model: 'gpt-5.5',
        sourcePath: '/private/provider/store',
        costSource: 'unpriced',
        costUsd: 0,
        unpricedRecords: 1,
        totals: {
          uncachedInputTokens: 42,
          cachedInputTokens: 8,
          cacheCreationTokens: 1,
          outputTokens: 2,
        },
      },
    ],
  });
  assert.deepEqual(result.accounting, {
    kind: 'partial',
    observedAt: NOW.toISOString(),
  });
  assert.deepEqual(result.buckets, [
    {
      day: '2026-11-21',
      provider: 'codex',
      model: 'gpt-5.5',
      accountId: null,
      uncachedInputTokens: 42,
      cachedInputTokens: 8,
      cacheCreationTokens: 1,
      outputTokens: 2,
      unpricedRecords: 1,
      costUsd: null,
    },
  ]);
});
