import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

const m = vi.hoisted(() => ({
  session: null as { id: string } | null,
  filters: [] as [string, unknown][],
  inserts: [] as unknown[],
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
  getPermissions: async () => ({ containsPermission: () => false }),
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    user: { id: 'actor' },
    supabase: {},
  }),
}));
vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace',
  getWorkspaceConfig: async () => 'true',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicClient: async () => ({}),
  createAdminClient: async () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          m.filters.push([`${table}.${column}`, value]);
          return q;
        },
        maybeSingle: async () => ({ data: m.session, error: null }),
      };
      return q;
    },
    schema: () => ({
      from: () => ({
        insert: (row: unknown) => {
          m.inserts.push(row);
          const result = { data: [row], error: null };
          return { select: () => Promise.resolve(result) };
        },
      }),
    }),
  }),
}));

import { POST } from './route';

const post = (linkedSessionId?: string) =>
  POST(
    new NextRequest(
      'http://localhost/api/v1/workspaces/ws/time-tracking/requests',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Missed time',
          startTime: '2026-01-01T09:00:00.000Z',
          endTime: '2026-01-01T10:00:00.000Z',
          linkedSessionId,
        }),
      }
    ),
    { params: Promise.resolve({ wsId: 'ws' }) }
  );

describe('time tracking request linked session', () => {
  beforeEach(() => {
    m.session = null;
    m.filters = [];
    m.inserts = [];
  });

  it('rejects a linked session outside the requester workspace and ownership before writing', async () => {
    const response = await post(SESSION_ID);
    expect(response.status).toBe(400);
    expect(m.inserts).toEqual([]);
    expect(m.filters).toEqual(
      expect.arrayContaining([
        ['time_tracking_sessions.id', SESSION_ID],
        ['time_tracking_sessions.ws_id', 'workspace'],
        ['time_tracking_sessions.user_id', 'actor'],
      ])
    );
  });

  it('stores a linked session owned by the requester', async () => {
    m.session = { id: SESSION_ID };
    const response = await post(SESSION_ID);
    expect(response.status).toBe(201);
    expect(m.inserts).toEqual([
      expect.objectContaining({
        user_id: 'actor',
        workspace_id: 'workspace',
        linked_session_id: SESSION_ID,
      }),
    ]);
  });

  it('does not look up a session when none is linked', async () => {
    const response = await post();
    expect(response.status).toBe(201);
    expect(m.filters).toEqual([]);
  });
});
