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

test('keeps impossible dates out of observations and quota resets', () => {
  const row = {
    ...PROVIDER,
    usageLimits: {
      checkedAt: '2026-02-31T00:00:00.000Z',
      windows: [
        {
          kind: 'session',
          usedPercent: 10,
          resetsAt: '2026-02-31T18:00:00+07:00',
        },
      ],
    },
  };
  const { accounts } = normalizeT3Quota({ providers: [row] }, NOW);
  assert.equal(accounts[0].checkedAt, null);
  assert.equal(accounts[0].windows[0].resetsAt, null);
  const { buckets, accounting } = normalizeT3Accounting({
    readAt: NOW.toISOString(),
    sources: [{ status: 'ok' }],
    buckets: [
      {
        day: '2026-02-31',
        provider: 'codex',
        model: 'fixture-model',
        unpricedRecords: 0,
        costSource: 'modelPriced',
        costUsd: 1,
        totals: {
          uncachedInputTokens: 1,
          cachedInputTokens: 0,
          cacheCreationTokens: 0,
          outputTokens: 1,
        },
      },
    ],
  });
  assert.equal(accounting.kind, 'partial');
  assert.deepEqual(buckets, []);
});

test('uses a valid reset when equally used quota windows disagree', () => {
  const { accounts } = normalizeT3Quota(
    {
      providers: [
        {
          ...PROVIDER,
          usageLimits: {
            ...PROVIDER.usageLimits,
            windows: [
              {
                kind: 'session',
                usedPercent: 88,
                resetsAt: '2026-11-31T19:00:00+07:00',
              },
              {
                kind: 'session',
                usedPercent: 88,
                resetsAt: '2026-11-21T19:00:00+07:00',
              },
            ],
          },
        },
      ],
    },
    NOW
  );
  assert.deepEqual(accounts[0].windows, [
    { kind: 'session', usedPercent: 88, resetsAt: '2026-11-21T12:00:00.000Z' },
  ]);
});

// Shapes T3 returned on 2026-11-22 for Cursor (two monthly rows), OpenCode
// (session, weekly and monthly) and a signed-in provider with no window.
test('reports monthly limits and names a signed-in provider without windows', () => {
  const limits = (windows) => ({
    checkedAt: '2026-11-21T18:29:00+07:00',
    windows,
  });
  const { accounts } = normalizeT3Quota(
    {
      providers: [
        {
          ...PROVIDER,
          instanceId: 'cursor',
          driver: 'cursor',
          usageLimits: limits([
            { kind: 'monthly', usedPercent: 100, resetsAt: '2026-11-26T03:52:28.283Z' },
            { kind: 'monthly', usedPercent: 100, resetsAt: '2026-11-26T03:52:28.283Z' },
          ]),
        },
        {
          ...PROVIDER,
          instanceId: 'opencode',
          driver: 'opencode',
          usageLimits: limits([
            { kind: 'session', usedPercent: 40, resetsAt: null },
            { kind: 'weekly', usedPercent: 69, resetsAt: null },
            { kind: 'monthly', usedPercent: 100, resetsAt: null },
          ]),
        },
        {
          ...PROVIDER,
          instanceId: 'opencode-open',
          driver: 'opencode',
          usageLimits: limits([
            { kind: 'session', usedPercent: 40, resetsAt: null },
            { kind: 'weekly', usedPercent: 69, resetsAt: null },
            { kind: 'monthly', usedPercent: 89, resetsAt: null },
          ]),
        },
        {
          ...PROVIDER,
          instanceId: 'no-windows',
          usageLimits: limits([]),
        },
      ],
    },
    NOW
  );
  const [cursor, capped, open, silent] = accounts;
  assert.deepEqual(cursor.status, { kind: 'limited', reason: 'monthly' });
  assert.deepEqual(cursor.windows, [
    { kind: 'monthly', usedPercent: 100, resetsAt: '2026-11-26T03:52:28.283Z' },
  ]);
  // Two rows at most, so older clients keep parsing; the exhausted one stays.
  assert.deepEqual(capped.status, { kind: 'limited', reason: 'monthly' });
  assert.deepEqual(
    capped.windows.map((window) => window.kind),
    ['session', 'monthly']
  );
  assert.deepEqual(open.status, { kind: 'available' });
  assert.deepEqual(
    open.windows.map((window) => window.kind),
    ['session', 'weekly']
  );
  assert.deepEqual(silent.status, { kind: 'unknown', reason: 'not_reported' });
});

test('treats a missing provider store and a provisional refresh as complete', () => {
  const summary = (sources) =>
    normalizeT3Accounting({ readAt: NOW.toISOString(), sources, buckets: [] });
  assert.equal(
    summary([
      { status: 'ok', refreshing: true },
      { status: 'missing' },
    ]).accounting.kind,
    'complete'
  );
  assert.equal(
    summary([{ status: 'ok' }, { status: 'error' }]).accounting.kind,
    'partial'
  );
  assert.equal(summary([]).accounting.kind, 'partial');
});
