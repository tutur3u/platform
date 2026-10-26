import type { Database } from '@tuturuuu/types';
import { afterEach, expect, it, vi } from 'vitest';

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient: admin }));

import {
  MAX_SPIKE_ALERT_RECIPIENTS,
  queueCalendarOAuthSpikeAlert,
} from './oauth-spike-notification';
import type { CalendarTokenOutcomeEntry } from './oauth-token-health';

type Args = Database['public']['Functions']['create_notification']['Args'];
function sink() {
  return {
    rpc: vi.fn(
      async (
        _fn: 'create_notification',
        _args: Args
      ): Promise<{ data: string | null; error: { code?: string } | null }> => ({
        data: 'notification-id',
        error: null,
      })
    ),
  };
}
const outcomes: CalendarTokenOutcomeEntry[] = [
  {
    account: 'sensitive-account-handle',
    provider: 'google',
    outcome: 'consensus_hold',
    reason: 'google_invalid_grant',
    providerCode: 'private-provider-code',
    attempts: 1,
  },
  {
    account: 'other-account',
    provider: 'microsoft',
    outcome: 'deactivated',
    attempts: 1,
  },
];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('queues a high-priority bilingual alert through the real existing notification RPC adapter', async () => {
  const client = sink();
  expect(
    await queueCalendarOAuthSpikeAlert(outcomes, {
      client,
      env: {
        CALENDAR_OAUTH_ALERT_RECIPIENTS: 'Ops@Example.test,ops@example.test',
      },
    })
  ).toEqual({ status: 'queued', queued: 1, failed: 0, unknown: 0 });
  expect(client.rpc).toHaveBeenCalledWith(
    'create_notification',
    expect.objectContaining({
      p_email: 'ops@example.test',
      p_type: 'account_update',
      p_code: 'calendar_oauth_health_spike',
      p_scope: 'user',
      p_priority: 'high',
      p_data: expect.objectContaining({
        event: 'calendar.oauth.deactivation_spike',
        evaluated: 2,
        counts: expect.objectContaining({ consensus_hold: 1, deactivated: 1 }),
      }),
      p_title: expect.stringContaining('OAuth Lịch'),
    })
  );
  const payload = JSON.stringify(client.rpc.mock.calls);
  expect(payload).not.toContain('sensitive-account-handle');
  expect(payload).not.toContain('private-provider-code');
});

it('bounds delivery and ignores malformed recipients', async () => {
  const client = sink();
  const recipients = Array.from(
    { length: 20 },
    (_, i) => `ops${i}@example.test`
  ).join(',');
  const result = await queueCalendarOAuthSpikeAlert(outcomes, {
    client,
    env: { CALENDAR_OAUTH_ALERT_RECIPIENTS: `invalid,${recipients}` },
  });
  expect(result).toEqual({
    status: 'queued',
    queued: MAX_SPIKE_ALERT_RECIPIENTS,
    failed: 0,
    unknown: 0,
  });
  expect(client.rpc).toHaveBeenCalledTimes(MAX_SPIKE_ALERT_RECIPIENTS);
});

it('reports an unconfigured sink without any notification write', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const client = sink();
  expect(
    await queueCalendarOAuthSpikeAlert(outcomes, { client, env: {} })
  ).toEqual({ status: 'unconfigured', queued: 0, failed: 0, unknown: 0 });
  expect(client.rpc).not.toHaveBeenCalled();
});

it('exposes partial failures and never replays an unknown write', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const client = sink();
  client.rpc.mockRejectedValueOnce(new Error('private transport details'));
  client.rpc.mockResolvedValueOnce({ data: null, error: { code: 'test' } });
  const result = await queueCalendarOAuthSpikeAlert(outcomes, {
    client,
    env: {
      CALENDAR_OAUTH_ALERT_RECIPIENTS:
        'a@example.test,b@example.test,c@example.test',
    },
  });
  expect(result).toEqual({
    status: 'partial',
    queued: 1,
    failed: 1,
    unknown: 1,
  });
  expect(client.rpc).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(error.mock.calls)).not.toContain(
    'private transport details'
  );
});

it('shares one transport deadline across the default notification client and recipients', async () => {
  const signals: Array<AbortSignal | null | undefined> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal);
      return Response.json('notification-id');
    })
  );
  admin.mockImplementation(
    async ({ fetch: transport }: { fetch: typeof fetch }) => ({
      rpc: async (_fn: string, _args: Args) => ({
        data: await (
          await transport('https://notification.example.test')
        ).json(),
        error: null,
      }),
    })
  );
  const result = await queueCalendarOAuthSpikeAlert(outcomes, {
    env: { CALENDAR_OAUTH_ALERT_RECIPIENTS: 'a@example.test,b@example.test' },
  });
  expect(result).toEqual({
    status: 'queued',
    queued: 2,
    failed: 0,
    unknown: 0,
  });
  expect(signals).toHaveLength(2);
  expect(signals[0]).toBeInstanceOf(AbortSignal);
  expect(signals[0]).toBe(signals[1]);
});
