import type { SupabaseClient } from '@tuturuuu/supabase';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));
vi.mock('@/lib/calendar/google-color-operations/route-handlers', () => ({
  googleColorOperationModeEnabled: () => false,
}));
import { GET } from './route';
const wsId = '00000000-0000-4000-8000-000000000001';
const connectionId = '00000000-0000-4000-8000-000000000002';

function database(provider: 'google' | 'microsoft', variant = '') {
  const rows: Record<string, Record<string, unknown>[]> = {
    workspace_calendars: [],
    calendar_auth_tokens: [
      {
        id: 'token',
        user_id: variant === 'foreign actor' ? 'other' : 'actor',
        ws_id: variant === 'foreign workspace' ? 'other' : wsId,
        provider,
        is_active: variant !== 'inactive',
        access_token: 'private-fixture',
        account_email: 'private@example.invalid',
      },
    ],
    calendar_connections: [
      {
        id: connectionId,
        ws_id: wsId,
        calendar_id: 'selected',
        calendar_name: 'Calendar',
        provider:
          variant === 'provider mismatch'
            ? provider === 'google'
              ? 'microsoft'
              : 'google'
            : provider,
        auth_token_id: 'token',
        access_role: variant === 'read-only' ? 'reader' : 'writer',
        is_enabled: variant !== 'disabled',
      },
    ],
  };
  function from(table: string) {
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
      then: (
        resolve: (result: { data: typeof selected; error: null }) => unknown
      ) => Promise.resolve(resolve({ data: selected, error: null })),
    };
    return query;
  }
  // Fixture implements only the read query boundary exercised by the real resolver.
  return { from, schema: () => ({ from }) } as unknown as SupabaseClient;
}
beforeEach(() => {
  vi.clearAllMocks();
});
it.each(['google', 'microsoft'] as const)(
  'resolves only the actor/workspace owned writable %s source',
  async (provider) => {
    mocks.authorize.mockResolvedValue({
      sbAdmin: database(provider),
      wsId,
      userId: 'actor',
    });
    const response = await GET(
      new Request(
        `https://calendar.test/capability?provider=${provider}&connectionId=${connectionId}`
      ),
      { params: Promise.resolve({ wsId }) }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      provider,
      connectionId,
      calendarId: 'selected',
      invitationCreates: true,
    });
  }
);
it.each([
  'foreign actor',
  'foreign workspace',
  'provider mismatch',
  'read-only',
  'inactive',
  'disabled',
])('refuses %s through real source resolution', async (variant) => {
  mocks.authorize.mockResolvedValue({
    sbAdmin: database('microsoft', variant),
    wsId,
    userId: 'actor',
  });
  const response = await GET(
    new Request(
      `https://calendar.test/capability?provider=microsoft&connectionId=${connectionId}`
    ),
    { params: Promise.resolve({ wsId }) }
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: 'Invitation source unavailable',
  });
});
