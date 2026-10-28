import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createInvitedMeeting: vi.fn(),
  createProviderEvent: vi.fn(),
  decryptEvents: vi.fn(),
  deduplicateEvents: vi.fn(),
  encryptEvent: vi.fn(),
  getSyncPreferences: vi.fn(),
  getWorkspaceKey: vi.fn(),
  membership: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuth: vi.fn(),
  resolveOutboundSource: vi.fn(),
  resolveSource: vi.fn(),
  refreshSource: vi.fn(),
  retained: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveAuth,
}));
vi.mock(
  '@/lib/calendar/google-color-operations/retained-generation-request-access',
  () => ({
    getCalendarRetainedGeneration: mocks.retained,
  })
);

vi.mock('@/lib/calendar/event-deduplication', () => ({
  deduplicateCalendarEvents: mocks.deduplicateEvents,
}));
vi.mock('@/lib/calendar/provider-writes', () => ({
  createProviderEvent: mocks.createProviderEvent,
}));
vi.mock('@/lib/calendar/source-resolver', () => ({
  resolveCalendarSource: mocks.resolveSource,
}));
vi.mock('@/lib/calendar/google-source-color-refresh', () => ({
  refreshOwnedGoogleSourceColor: mocks.refreshSource,
}));
vi.mock('@/lib/calendar/sync-preferences', () => ({
  getCalendarSyncPreferences: mocks.getSyncPreferences,
  resolveOutboundSyncSource: mocks.resolveOutboundSource,
}));
vi.mock('@/lib/workspace-encryption', () => ({
  decryptEventsFromStorage: mocks.decryptEvents,
  encryptEventForStorage: mocks.encryptEvent,
  getWorkspaceKey: mocks.getWorkspaceKey,
}));

vi.mock('@/lib/calendar/create-invited-meeting', async (original) => ({
  ...(await original<typeof import('@/lib/calendar/create-invited-meeting')>()),
  createInvitedMeeting: mocks.createInvitedMeeting,
}));

import { POST } from './route';

const WS_ID = '00000000-0000-4000-8000-000000008611';
const USER_ID = '00000000-0000-4000-8000-000000008601';

function params(wsId = WS_ID) {
  return { params: Promise.resolve({ wsId }) };
}

function request(method: string, body?: unknown) {
  return new Request(
    `https://calendar.test/api/v1/workspaces/${WS_ID}/calendar/events?start_at=2026-08-10T00%3A00%3A00.000Z&end_at=2026-08-11T00%3A00%3A00.000Z`,
    {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers:
        body === undefined ? undefined : { 'content-type': 'application/json' },
    }
  );
}

function insertQueryResult(data: unknown) {
  const single = vi.fn(async () => ({ data, error: null }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { insert, select, single };
}

describe('calendar event task workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED', 'false');
    mocks.resolveAuth.mockResolvedValue({
      ok: true,
      supabase: { rpc: vi.fn(async () => ({ data: true, error: null })) },
      user: { id: USER_ID },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.membership.mockResolvedValue({ ok: true });
    mocks.resolveSource.mockResolvedValue({
      provider: 'tuturuuu',
      workspaceCalendarId: null,
    });
    mocks.retained.mockResolvedValue(null);
    mocks.resolveOutboundSource.mockResolvedValue(null);
    mocks.getSyncPreferences.mockResolvedValue({ settingsAvailable: false });
    mocks.getWorkspaceKey.mockResolvedValue(null);
    mocks.encryptEvent.mockImplementation(async (_wsId, event) => ({
      ...event,
      is_encrypted: false,
    }));
  });
  afterEach(() => vi.unstubAllEnvs());
  const taskId = '00000000-0000-4000-8000-000000008699';
  const body = {
    title: 'Meeting',
    start_at: '2026-11-01T05:30:00.000Z',
    end_at: '2026-11-01T06:00:00.000Z',
    task_id: taskId,
  };
  it.each(['foreign', 'missing', 'error'])(
    'rejects a %s task before provider or event writes',
    async (kind) => {
      const insert = vi.fn(() => ({
        select: () => ({
          single: async () => ({ data: { id: 'event' }, error: null }),
        }),
      }));
      const q = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data:
            kind === 'foreign'
              ? {
                  id: taskId,
                  task_lists: { workspace_boards: { ws_id: 'foreign' } },
                }
              : null,
          error: kind === 'error' ? { message: 'lookup failed' } : null,
        }),
        insert,
      };
      mocks.createAdminClient.mockResolvedValue({ from: () => q });
      const response = await POST(request('POST', body), params());
      expect(response.status).toBe(kind === 'error' ? 500 : 400);
      expect(insert).not.toHaveBeenCalled();
      expect(mocks.createProviderEvent).not.toHaveBeenCalled();
    }
  );
  it('allows a task from the authorized workspace', async () => {
    const insert = insertQueryResult({ id: 'event' });
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: taskId,
          task_lists: { workspace_boards: { ws_id: WS_ID } },
        },
        error: null,
      }),
    };
    mocks.createAdminClient.mockResolvedValue({
      from: (table: string) =>
        table === 'tasks'
          ? {
              ...q,
              select: vi.fn().mockReturnValue({
                eq: () => ({ maybeSingle: q.maybeSingle }),
              }),
            }
          : insert,
    });
    expect((await POST(request('POST', body), params())).status).toBe(201);
  });
});
