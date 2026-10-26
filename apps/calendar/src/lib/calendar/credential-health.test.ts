import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('./token-refresh', () => ({ ensureValidToken: refresh }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import {
  credentialSyncErrorType,
  ensureHealthyCalendarCredential,
  MAX_TRANSIENT_RETRIES,
  transientBackoffMs,
} from './credential-health';
import { withCalendarTokenHealthRun } from './oauth-token-health';
import { withProviderSyncBudget } from './provider-sync-budget';
import type { CalendarAuthToken } from './token-refresh';

const token = {
  id: 'token-id',
  ws_id: 'workspace',
  provider: 'google',
  refresh_token: 'refresh-credential-value',
  created_at: '2026-10-26T00:00:00Z',
  is_active: true,
} as CalendarAuthToken;
const transient = {
  accessToken: '',
  expiresAt: null,
  refreshed: false,
  error: 'Google token refresh failed',
  failure: { kind: 'transient', providerCode: 'http_503' },
};
const sleep = vi.fn(async () => {});

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

it('retries transient failures with growing backoff and never quarantines', async () => {
  refresh.mockResolvedValue(transient);
  const { outcome } = await ensureHealthyCalendarCredential(
    { from: vi.fn() },
    token,
    {
      sleep,
    }
  );
  expect(refresh).toHaveBeenCalledTimes(MAX_TRANSIENT_RETRIES + 1);
  expect(sleep).toHaveBeenCalledTimes(MAX_TRANSIENT_RETRIES);
  expect(outcome).toMatchObject({ outcome: 'transient', attempts: 3 });
  expect(transientBackoffMs(1, () => 0)).toBe(250);
  expect(transientBackoffMs(2, () => 0)).toBe(1000);
  expect(transientBackoffMs(2, () => 1)).toBe(1500);
});

it('recovers when a retry succeeds', async () => {
  refresh.mockResolvedValueOnce(transient).mockResolvedValue({
    accessToken: 'fresh',
    expiresAt: null,
    refreshed: true,
  });
  const { result, outcome } = await ensureHealthyCalendarCredential(
    { from: vi.fn() },
    token,
    { sleep }
  );
  expect(result.accessToken).toBe('fresh');
  expect(outcome).toMatchObject({ outcome: 'ok', attempts: 2 });
});

it('does not retry a permanent failure and reports its quarantine', async () => {
  refresh.mockResolvedValue({
    ...transient,
    error: 'invalid_grant',
    failure: {
      kind: 'permanent',
      reason: 'google_invalid_grant',
      providerCode: 'invalid_grant/http_400',
    },
    quarantine: 'deactivated',
  });
  const { outcomes } = await withCalendarTokenHealthRun('/test', () =>
    ensureHealthyCalendarCredential({ from: vi.fn() }, token, { sleep })
  );
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
  expect(outcomes).toEqual([
    expect.objectContaining({
      outcome: 'deactivated',
      reason: 'google_invalid_grant',
      provider: 'google',
    }),
  ]);
  expect(JSON.stringify(outcomes)).not.toContain('token-id');
});

it('keeps a permanent failure retryable when its quarantine write failed', async () => {
  refresh.mockResolvedValue({
    ...transient,
    failure: { kind: 'permanent', reason: 'google_invalid_grant' },
  });
  const { outcome } = await ensureHealthyCalendarCredential(
    { from: vi.fn() },
    token,
    {
      sleep,
    }
  );
  expect(outcome.outcome).toBe('transient');
});

it('stops retrying once the run budget is spent', async () => {
  refresh.mockResolvedValue(transient);
  const controller = new AbortController();
  controller.abort();
  await withProviderSyncBudget(controller.signal, () =>
    ensureHealthyCalendarCredential({ from: vi.fn() }, token, { sleep })
  );
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('logs one structured line with a hashed account and the route', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  refresh.mockResolvedValue({
    ...transient,
    failure: { kind: 'systemic', providerCode: 'invalid_client' },
  });
  await withCalendarTokenHealthRun('/api/cron/calendar/provider-sync', () =>
    ensureHealthyCalendarCredential({ from: vi.fn() }, token, { sleep })
  );
  expect(warn).toHaveBeenCalledTimes(1);
  const [event, line] = warn.mock.calls[0]!;
  expect(event).toBe('calendar.oauth.token_outcome');
  expect(line).toMatchObject({
    route: '/api/cron/calendar/provider-sync',
    provider: 'google',
    outcome: 'systemic',
    providerCode: 'invalid_client',
    account: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(JSON.stringify(line)).not.toMatch(/token-id|refresh-credential/);
});

it('reports a breaker hold as a reconnect-worthy auth failure', async () => {
  refresh.mockResolvedValue({
    ...transient,
    error: 'invalid_grant',
    failure: {
      kind: 'permanent',
      reason: 'google_invalid_grant',
      providerCode: 'invalid_grant/http_400',
    },
    quarantine: 'consensus_hold',
  });
  const { result, outcome } = await ensureHealthyCalendarCredential(
    { from: vi.fn() },
    token,
    { sleep }
  );
  expect(outcome.outcome).toBe('consensus_hold');
  expect(credentialSyncErrorType(result)).toBe('auth');
});

it('skips without retrying when a reconnect fenced the refresh', async () => {
  refresh.mockResolvedValue({
    accessToken: 'stale',
    expiresAt: null,
    refreshed: true,
    error: 'Credential replaced by a reconnect',
    fenced: true,
  });
  const { result, outcome } = await ensureHealthyCalendarCredential(
    { from: vi.fn() },
    token,
    { sleep }
  );
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(outcome.outcome).toBe('fenced');
  expect(credentialSyncErrorType(result)).toBe('network');
});

it('records a fresh refresh as proof the client works', async () => {
  refresh.mockResolvedValueOnce({
    accessToken: 'fresh',
    expiresAt: null,
    refreshed: true,
  });
  const fresh = await ensureHealthyCalendarCredential(
    { from: vi.fn() },
    token,
    { sleep }
  );
  expect(fresh.outcome).toMatchObject({ outcome: 'ok', refreshed: true });

  refresh.mockResolvedValueOnce({
    accessToken: 'unexpired',
    expiresAt: null,
    refreshed: false,
  });
  const unexpired = await ensureHealthyCalendarCredential(
    { from: vi.fn() },
    token,
    { sleep }
  );
  expect(unexpired.outcome).not.toHaveProperty('refreshed');
});
