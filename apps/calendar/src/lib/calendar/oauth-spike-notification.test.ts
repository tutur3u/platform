// @vitest-environment node

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import viMessages from '../../../messages/vi.json';
import { CALENDAR_OAUTH_SPIKE_COPY } from './oauth-spike-copy';
import {
  MAX_SPIKE_ALERT_RECIPIENTS,
  queueCalendarOAuthSpikeAlert,
} from './oauth-spike-notification';
import type { CalendarTokenOutcomeEntry } from './oauth-token-health';

const OPERATOR_ID = '00000000-0000-4000-8000-000000000001';
const outcomes: CalendarTokenOutcomeEntry[] = [
  {
    account: 'private-account-handle',
    provider: 'google',
    outcome: 'consensus_hold',
    providerCode: 'private-provider-code',
    attempts: 1,
  },
];
const env = {
  CALENDAR_OAUTH_ALERT_RECIPIENTS: 'Ops@Example.test,ops@example.test',
};

type FixtureOptions = {
  profile?: boolean | 'error';
  member?: boolean;
  role?: 'MEMBER' | 'GUEST';
  confirmed?: boolean;
  email?: string;
  rpc?: 'ok' | 'suppressed' | 'http-error' | 'abort';
};
function transport(options: FixtureOptions = {}) {
  const requests: Array<{ url: URL; signal: AbortSignal | null | undefined }> =
    [];
  const writes: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push({ url, signal: init?.signal });
      if (url.pathname === '/rest/v1/user_private_details') {
        if (options.profile === 'error')
          return Response.json(
            { message: 'synthetic unavailable' },
            { status: 503 }
          );
        return Response.json(
          options.profile === false
            ? []
            : [{ user_id: OPERATOR_ID, deleted: false }]
        );
      }
      if (url.pathname === '/rest/v1/workspace_members') {
        expect(url.searchParams.get('ws_id')).toBe(`eq.${ROOT_WORKSPACE_ID}`);
        expect(url.searchParams.get('user_id')).toBe(`eq.${OPERATOR_ID}`);
        return Response.json(
          options.member === false ||
            (options.role === 'GUEST' &&
              url.searchParams.get('type') === 'eq.MEMBER')
            ? []
            : [{ user_id: OPERATOR_ID }]
        );
      }
      if (url.pathname === `/auth/v1/admin/users/${OPERATOR_ID}`) {
        const profileRequest = requests
          .filter(
            ({ url: entry }) =>
              entry.pathname === '/rest/v1/user_private_details'
          )
          .at(-1);
        const email =
          profileRequest?.url.searchParams.get('email')?.slice(3) ??
          'ops@example.test';
        return Response.json({
          id: OPERATOR_ID,
          email: options.email ?? email,
          email_confirmed_at:
            options.confirmed === false ? null : '2026-10-01T00:00:00Z',
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-10-01T00:00:00Z',
        });
      }
      if (url.pathname === '/rest/v1/rpc/create_notification') {
        writes.push(JSON.parse(String(init?.body)));
        if (options.rpc === 'abort')
          throw new DOMException(
            'synthetic abort after dispatch',
            'AbortError'
          );
        if (options.rpc === 'http-error')
          return Response.json(
            { code: '42501', message: 'synthetic permission error' },
            { status: 403 }
          );
        return Response.json(
          options.rpc === 'suppressed' ? null : 'notification-id'
        );
      }
      throw new Error('Unexpected synthetic transport path');
    })
  );
  return { requests, writes };
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://supabase.example.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'synthetic-test-only-service-key');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('uses the real admin client to resolve a confirmed root member and serialize p_user_id only', async () => {
  const h = transport();
  const result = await queueCalendarOAuthSpikeAlert(outcomes, { env });
  expect(result).toMatchObject({ status: 'queued', queued: 1 });
  expect(h.writes).toHaveLength(1);
  expect(
    h.writes[0]?.p_user_id,
    'p_user_id must identify a confirmed root operator'
  ).toBe(OPERATOR_ID);
  expect(h.writes[0]).toMatchObject({
    p_user_id: OPERATOR_ID,
    p_ws_id: ROOT_WORKSPACE_ID,
    p_scope: 'user',
    p_type: 'account_update',
    p_code: 'calendar_oauth_health_spike',
    p_priority: 'high',
  });
  expect(h.writes[0]).not.toHaveProperty('p_email');
  expect(
    h.requests
      .find(({ url }) => url.pathname === '/rest/v1/workspace_members')
      ?.url.searchParams.get('type')
  ).toBe('eq.MEMBER');
  expect(result).toEqual({
    status: 'queued',
    queued: 1,
    failed: 0,
    unknown: 0,
    unresolved: 0,
    suppressed: 0,
  });
  const serialized = JSON.stringify(h.writes);
  for (const forbidden of [
    'ops@example.test',
    'private-account-handle',
    'private-provider-code',
  ])
    expect(serialized).not.toContain(forbidden);
  expect(h.requests).toHaveLength(4);
  expect(
    h.requests.every(({ signal }) => signal === h.requests[0]?.signal)
  ).toBe(true);
  expect(h.requests[0]?.signal).toBeInstanceOf(AbortSignal);
});

it.each([
  { profile: false },
  { member: false },
  { confirmed: false },
  { email: 'changed@example.test' },
])(
  'makes no notification write for an unresolved operator: %j',
  async (options) => {
    const h = transport(options);
    expect(await queueCalendarOAuthSpikeAlert(outcomes, { env })).toMatchObject(
      { status: 'unresolved', unresolved: 1, queued: 0, failed: 0, unknown: 0 }
    );
    expect(h.writes).toHaveLength(0);
  }
);

it('reports preference suppression separately from a failed delivery', async () => {
  const h = transport({ rpc: 'suppressed' });
  expect(await queueCalendarOAuthSpikeAlert(outcomes, { env })).toMatchObject({
    status: 'suppressed',
    suppressed: 1,
    queued: 0,
    failed: 0,
    unknown: 0,
  });
  expect(h.writes).toHaveLength(1);
});

it('classifies the real postgrest AbortError status0 result as unknown without replaying the write', async () => {
  const h = transport({ rpc: 'abort' });
  expect(await queueCalendarOAuthSpikeAlert(outcomes, { env })).toMatchObject({
    status: 'unknown',
    unknown: 1,
    queued: 0,
    failed: 0,
  });
  expect(h.writes).toHaveLength(1);
});

it('keeps HTTP errors distinct from unknown transport outcomes', async () => {
  const h = transport({ rpc: 'http-error' });
  expect(await queueCalendarOAuthSpikeAlert(outcomes, { env })).toMatchObject({
    status: 'failed',
    unknown: 0,
    queued: 0,
    failed: 1,
  });
  expect(h.writes).toHaveLength(1);
});

it('bounds configured recipient processing to five and performs no work without configuration', async () => {
  const h = transport();
  expect(
    await queueCalendarOAuthSpikeAlert(outcomes, { env: {} })
  ).toMatchObject({ status: 'unconfigured', queued: 0 });
  expect(h.requests).toHaveLength(0);
  const recipients = Array.from(
    { length: 20 },
    (_, index) => `ops${index}@example.test`
  ).join(',');
  expect(
    await queueCalendarOAuthSpikeAlert(outcomes, {
      env: { CALENDAR_OAUTH_ALERT_RECIPIENTS: recipients },
    })
  ).toMatchObject({ status: 'queued', queued: MAX_SPIKE_ALERT_RECIPIENTS });
  expect(h.writes).toHaveLength(MAX_SPIKE_ALERT_RECIPIENTS);
});

it('keeps the small runtime copy aligned with both message bundles', () => {
  expect(CALENDAR_OAUTH_SPIKE_COPY.en).toEqual({
    title: en.calendar.oauth_spike_alert_title,
    description: en.calendar.oauth_spike_alert_description,
  });
  expect(CALENDAR_OAUTH_SPIKE_COPY.vi).toEqual({
    title: viMessages.calendar.oauth_spike_alert_title,
    description: viMessages.calendar.oauth_spike_alert_description,
  });
});

it('does not retry unavailable recipient metadata reads or write a notification', async () => {
  const h = transport({ profile: 'error' });
  expect(await queueCalendarOAuthSpikeAlert(outcomes, { env })).toMatchObject({
    status: 'failed',
    failed: 1,
    queued: 0,
  });
  expect(h.requests).toHaveLength(1);
  expect(h.writes).toHaveLength(0);
});

it('makes no alert write for a confirmed GUEST in the root workspace', async () => {
  const h = transport({ role: 'GUEST' });
  const result = await queueCalendarOAuthSpikeAlert(outcomes, { env });
  expect(h.writes).toHaveLength(0);
  expect(result).toMatchObject({
    status: 'unresolved',
    unresolved: 1,
    queued: 0,
  });
});
