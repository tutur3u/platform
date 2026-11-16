import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), get: vi.fn() }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));
vi.mock('@tuturuuu/google', () => ({
  google: { calendar: () => ({ events: { get: mocks.get } }) },
}));
vi.mock('@/lib/calendar/provider-writes', () => ({
  createGoogleAuthClient: () => ({}),
}));
import { dispatchCalendarEndpoint } from '@/runtime/api-registry.server';
import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { GET } from './route';
vi.mock('@tanstack/react-start/server-only', () => ({}));

const wsId = '00000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000002';
const path = `/api/v1/workspaces/${wsId}/calendar/events/${eventId}/attendees`;
const params = { params: Promise.resolve({ wsId, eventId }) };
const providerEvent = {
  id: 'external-event',
  etag: 'version',
  status: 'confirmed',
  organizer: { self: true, email: 'host@example.invalid' },
  attendees: [
    {
      email: 'guest@example.invalid',
      responseStatus: 'accepted',
      resource: true,
    },
  ],
};
function access(variant = '') {
  const rows: Record<string, Record<string, unknown>[]> = {
    workspace_calendar_events: [
      {
        id: eventId,
        ws_id: variant === 'foreign event workspace' ? 'foreign' : wsId,
        provider: variant === 'native' ? 'tuturuuu' : 'google',
        source_calendar_id: 'local-calendar',
        external_calendar_id:
          variant === 'foreign calendar' ? 'other' : 'calendar',
        external_event_id: 'external-event',
        scheduling_metadata:
          variant === 'pending'
            ? { meeting_delivery: 'pending' }
            : variant === 'provider color'
              ? { google_color: {} }
              : null,
      },
    ],
    calendar_auth_tokens: [
      {
        id: 'token',
        ws_id: variant === 'foreign source workspace' ? 'foreign' : wsId,
        user_id: variant === 'foreign actor' ? 'foreign' : 'actor',
        provider: 'google',
        access_token: 'private-fixture',
        account_email: 'host@example.invalid',
        is_active: true,
      },
    ],
    calendar_connections: [
      {
        id: 'connection',
        ws_id: wsId,
        auth_token_id: 'token',
        provider: variant === 'wrong provider' ? 'microsoft' : 'google',
        workspace_calendar_id: 'local-calendar',
        calendar_id: 'calendar',
        access_role: variant === 'read-only' ? 'reader' : 'writer',
        is_enabled: true,
      },
    ],
  };
  const from = (table: string) => {
    let selected = rows[table] ?? [];
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        selected = selected.filter((row) => row[key] === value);
        return query;
      },
      in: (key: string, values: unknown[]) => {
        selected = selected.filter((row) => values.includes(row[key]));
        return query;
      },
      order: () => query,
      maybeSingle: async () => ({ data: selected[0] ?? null, error: null }),
      then: (
        resolve: (result: { data: typeof selected; error: null }) => unknown
      ) => Promise.resolve(resolve({ data: selected, error: null })),
    };
    return query;
  };
  const rpc = vi.fn(async (name: string) => ({
    data:
      name === 'calendar_retained_generation'
        ? variant === 'retained'
          ? { pending: true }
          : null
        : variant === 'recurring',
    error:
      variant === 'recurrence unavailable' &&
      name !== 'calendar_retained_generation'
        ? { code: 'PGRST202' }
        : null,
  }));
  return {
    wsId,
    userId: 'actor',
    sbAdmin: { from, rpc } as unknown as TypedSupabaseClient,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED', 'false');
  mocks.authorize.mockResolvedValue(access());
  mocks.get.mockResolvedValue({ data: providerEvent });
});
it('reads only the actor/source-bound organizer snapshot and keeps attendee changes unavailable', async () => {
  const response = await GET(
    new Request(`https://calendar.test${path}`),
    params
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({
    eventId,
    provider: 'google',
    connectionId: 'connection',
    calendarId: 'calendar',
    revision: 'version',
    attendeeEditing: false,
    attendees: [
      {
        email: 'guest@example.invalid',
        response: 'accepted',
        resource: true,
        optional: false,
      },
    ],
  });
  expect(mocks.get).toHaveBeenCalledTimes(1);
});
it.each([401, 403])('preserves authorization denial %s', async (status) => {
  mocks.authorize.mockResolvedValue({ error: Response.json({}, { status }) });
  expect(
    (await GET(new Request(`https://calendar.test${path}`), params)).status
  ).toBe(status);
  expect(mocks.get).not.toHaveBeenCalled();
});
it.each([
  'foreign event workspace',
  'foreign source workspace',
  'foreign actor',
  'wrong provider',
  'foreign calendar',
  'read-only',
  'native',
  'pending',
  'provider color',
  'retained',
  'recurring',
  'recurrence unavailable',
])('fails closed on %s before provider reads', async (variant) => {
  mocks.authorize.mockResolvedValue(access(variant));
  const response = await GET(
    new Request(`https://calendar.test${path}`),
    params
  );
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(JSON.stringify(await response.json())).not.toContain(
    'private-fixture'
  );
});
it('refuses flag ON and client-forged source/organizer query fields', async () => {
  vi.stubEnv('CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED', 'true');
  expect(
    (await GET(new Request(`https://calendar.test${path}`), params)).status
  ).toBe(409);
  expect(
    (
      await GET(
        new Request(
          `https://calendar.test${path}?organizer=host&provider=google`
        ),
        params
      )
    ).status
  ).toBe(400);
  expect(mocks.get).not.toHaveBeenCalled();
});
it('sanitizes provider errors without exposing account or tokens', async () => {
  mocks.get.mockRejectedValueOnce(
    new Error('private-fixture host@example.invalid')
  );
  const response = await GET(
    new Request(`https://calendar.test${path}`),
    params
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: 'Calendar attendee snapshot is unavailable',
  });
});
it('dispatches the native GET once and refuses attendee mutations', async () => {
  const response = await dispatchCalendarEndpoint(
    new NextRequest(`https://calendar.test${path}`)
  );
  expect(response?.status).toBe(200);
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(
    expect.any(Request),
    wsId
  );
  expect(mocks.get).toHaveBeenCalledTimes(1);
  for (const method of ['PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS']) {
    const refused = await dispatchCalendarEndpoint(
      new NextRequest(`https://calendar.test${path}`, { method })
    );
    expect(refused?.status).toBe(method === 'OPTIONS' ? 204 : 405);
  }
  expect(mocks.get).toHaveBeenCalledTimes(1);
});
