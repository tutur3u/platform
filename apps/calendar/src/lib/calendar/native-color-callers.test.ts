import { NextRequest } from 'next/server';
import { v7 } from 'uuid';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  insert: vi.fn(),
  source: vi.fn(),
  outboundSource: vi.fn(),
}));
vi.mock(
  '@/lib/calendar/google-color-operations/retained-generation-request-access',
  () => ({ getCalendarRetainedGeneration: vi.fn(async () => null) })
);
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: async () => ({
    sbAdmin: await mocks.admin(),
    wsId: WS_ID,
    userId: 'actor',
  }),
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    user: { id: 'actor' },
    supabase: {},
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));
vi.mock('@/lib/calendar/source-resolver', () => ({
  resolveCalendarSource: mocks.source,
}));
vi.mock('@/lib/calendar/sync-preferences', () => ({
  getCalendarSyncPreferences: async () => ({
    settingsAvailable: true,
    inboundSyncEnabled: false,
    outboundSyncEnabled: true,
  }),
  resolveOutboundSyncSource: mocks.outboundSource,
}));
vi.mock('@/lib/calendar/google-inbound-sync', () => ({
  syncGoogleInbound: vi.fn(),
}));
vi.mock('@/lib/calendar/token-refresh', () => ({ ensureValidToken: vi.fn() }));
vi.mock('@tuturuuu/utils/coordination', () => ({
  coordinationKey: (id: string) => id,
  coordinate: async ({ action }: { action: string }) =>
    action === 'acquire'
      ? { outcome: 'acquired', fresh: true, completed: false }
      : { outcome: action === 'complete' ? 'completed' : 'released' },
}));
vi.mock('@/lib/workspace-encryption', () => ({
  getWorkspaceKey: async () => null,
  encryptEventForStorage: async (
    _ws: string,
    fields: Record<string, unknown>
  ) => ({ ...fields, is_encrypted: false }),
  decryptEventFromStorage: async (row: unknown) => row,
  decryptEventsFromStorage: async (rows: unknown) => rows,
}));
vi.mock('@tuturuuu/microsoft', () => ({ createGraphClient: vi.fn() }));
vi.mock('@tuturuuu/microsoft/calendar', () => ({
  fetchMicrosoftEvents: vi.fn(),
  convertMicrosoftEventToWorkspaceFormat: vi.fn(),
}));
vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: vi.fn(function (this: { setCredentials: unknown }) {
    this.setCredentials = vi.fn();
  }),
  google: { calendar: vi.fn(() => ({ events: { insert: mocks.insert } })) },
}));

// The routes, durable invitation caller, provider writer and color mapper are real.
// Only authorization/storage and the external Google API boundary are fixtures.
import { POST as create } from '../../app/api/v1/workspaces/[wsId]/calendar/events/route';
import { POST as sync } from '../../app/api/v1/workspaces/[wsId]/calendar/sync/route';

const WS_ID = '00000000-0000-4000-8000-000000008611';
const CONNECTION_ID = '00000000-0000-4000-8000-000000008612';
const source = {
  provider: 'google',
  connectionId: CONNECTION_ID,
  externalCalendarId: 'primary',
  workspaceCalendarId: null,
  accessToken: 'synthetic-provider-token',
  accountEmail: 'organizer@example.test',
};
type Row = Record<string, unknown>;
type Result = { data: Row | Row[] | null; error: null };
function database(seed: Row[] = []) {
  const rows = new Map(seed.map((row) => [String(row.id), row]));
  function from(table: string) {
    let operation = 'read';
    let payload: Row = {};
    const filters: Row = {};
    function result(single: boolean): Result {
      if (table === 'calendar_sync_dashboard')
        return { data: single ? { id: 'run' } : [], error: null };
      if (table === 'workspaces')
        return { data: { creator_id: 'actor' }, error: null };
      if (table !== 'workspace_calendar_events')
        return { data: single ? null : [], error: null };
      if (operation === 'insert') {
        const id = String(payload.id ?? 'created');
        rows.set(id, { ...payload, id });
        return { data: rows.get(id) ?? null, error: null };
      }
      if (operation === 'update') {
        const id = String(filters.id);
        const row = rows.get(id);
        if (row) rows.set(id, { ...row, ...payload });
        return { data: rows.get(id) ?? null, error: null };
      }
      const matches = [...rows.values()].filter((row) =>
        Object.entries(filters).every(([key, value]) => row[key] === value)
      );
      return { data: single ? (matches[0] ?? null) : matches, error: null };
    }
    return {
      select() {
        return this;
      },
      eq(key: string, value: unknown) {
        filters[key] = value;
        return this;
      },
      insert(value: Row) {
        operation = 'insert';
        payload = value;
        return this;
      },
      update(value: Row) {
        operation = 'update';
        payload = value;
        return this;
      },
      or() {
        return this;
      },
      is() {
        return this;
      },
      in() {
        return this;
      },
      gte() {
        return this;
      },
      lte() {
        return this;
      },
      lt() {
        return this;
      },
      not() {
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return this;
      },
      single: async () => result(true),
      maybeSingle: async () => result(true),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query fixtures intentionally implement its awaitable builder contract.
      then(
        onfulfilled: (value: Result) => unknown,
        onrejected?: (reason: unknown) => unknown
      ) {
        return Promise.resolve(result(false)).then(onfulfilled, onrejected);
      },
    };
  }
  const rpc = vi.fn(async (name: string, input: Record<string, unknown>) => {
    expect(name).toBe('calendar_retained_generation');
    expect(input).toMatchObject({ p_ws_id: WS_ID, p_actor_id: 'actor' });
    expect(input.p_event_id).toEqual(expect.any(String));
    return { data: null, error: null };
  });
  return { rows, client: { from, rpc } };
}
const params = () => ({ params: Promise.resolve({ wsId: WS_ID }) });
const event = {
  title: 'Synthetic lesson',
  start_at: '2026-10-01T09:00:00Z',
  end_at: '2026-10-01T10:00:00Z',
};
function request(path: string, body: unknown) {
  return new NextRequest(
    `https://calendar.test/api/v1/workspaces/${WS_ID}/calendar/${path}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}
describe('production native color callers reach Google insert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.source.mockResolvedValue(source);
    mocks.outboundSource.mockResolvedValue(source);
    mocks.insert.mockResolvedValue({ data: { id: 'google-created' } });
  });
  for (const [color, colorId] of [
    ['RED', '11'],
    ['CYAN', '7'],
  ] as const) {
    it.each(['ordinary', 'invited', 'native mirror'])(
      `creates ${color} through %s with colorId=${colorId}`,
      async (kind) => {
        const db = database();
        mocks.admin.mockResolvedValue(db.client);
        if (kind === 'native mirror')
          mocks.source.mockResolvedValue({
            provider: 'tuturuuu',
            workspaceCalendarId: null,
          });
        const invitation = {
          guests: [
            {
              email: 'guest@example.test',
              displayName: undefined,
              optional: false,
            },
          ],
          timeZone: 'Asia/Ho_Chi_Minh',
        };
        const response = await create(
          request('events', {
            ...event,
            color,
            source: { provider: 'google', connectionId: CONNECTION_ID },
            ...(kind === 'invited' ? { invitation, requestId: v7() } : {}),
          }),
          params()
        );
        expect(response.status).toBe(201);
        expect(mocks.insert).toHaveBeenCalledOnce();
        expect(mocks.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            requestBody: expect.objectContaining({
              colorId,
              summary: event.title,
              start: expect.objectContaining({ dateTime: event.start_at }),
            }),
          })
        );
        expect([...db.rows.values()][0]?.color).toBe(color);
        if (kind === 'invited')
          expect(mocks.insert.mock.calls[0]?.[0].requestBody.attendees).toEqual(
            [
              {
                email: 'guest@example.test',
                displayName: undefined,
                optional: false,
              },
            ]
          );
      }
    );
    it(`syncs stored native ${color} with colorId=${colorId}`, async () => {
      const db = database([{ ...event, id: 'native', ws_id: WS_ID, color }]);
      mocks.admin.mockResolvedValue(db.client);
      const response = await sync(
        request('sync', { direction: 'outbound' }),
        params()
      );
      expect(response.status).toBe(200);
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          requestBody: expect.objectContaining({
            colorId,
            summary: event.title,
          }),
        })
      );
      expect(db.rows.get('native')).toEqual(
        expect.objectContaining({
          external_event_id: 'google-created',
          sync_status: 'synced',
          color,
        })
      );
    });
  }
});
