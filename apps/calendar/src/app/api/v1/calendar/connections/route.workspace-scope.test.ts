import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  normalizeWorkspaceIdMock,
  resolveSessionAuthContextMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  normalizeWorkspaceIdMock: vi.fn(),
  resolveSessionAuthContextMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: verifyWorkspaceMembershipTypeMock,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: resolveSessionAuthContextMock,
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: normalizeWorkspaceIdMock,
}));

import { DELETE, PATCH } from './route';

const WS_A = '071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1';
const WS_B = '5b0a3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const OWN_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_CONNECTION_ID = '22222222-2222-4222-8222-222222222222';

type Row = { id: string; ws_id: string };
type Filters = Array<[string, unknown]>;
type Call = { op: 'select' | 'update' | 'delete'; filters: Filters };

/**
 * Admin-client stand-in (app-session auth bypasses RLS) that applies the
 * route's `.eq()` filters to an in-memory table, so a filter the route forgets
 * shows up as a cross-workspace match. `staleLookupWsId` makes the workspace
 * lookup answer with a workspace the row no longer belongs to, modelling a
 * stale read or a row moved between lookup and write.
 */
function createSupabaseMock(
  rows: Row[],
  options: { staleLookupWsId?: string } = {}
) {
  const table = rows.map((row) => ({ ...row }));
  const calls: Call[] = [];

  const matches = (filters: Filters) =>
    table.filter((row) =>
      filters.every(
        ([column, value]) => (row as Record<string, unknown>)[column] === value
      )
    );

  const from = vi.fn((name: string) => {
    expect(name).toBe('calendar_connections');
    const call: Call = { op: 'select', filters: [] };
    calls.push(call);

    const settle = () => {
      const matched = matches(call.filters);
      if (call.op === 'delete') {
        for (const row of matched) table.splice(table.indexOf(row), 1);
      }
      return matched;
    };

    const builder: Record<string, any> = {
      select: vi.fn(() => builder),
      update: vi.fn(() => {
        call.op = 'update';
        return builder;
      }),
      delete: vi.fn(() => {
        call.op = 'delete';
        return builder;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      }),
      is: vi.fn((column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      }),
      maybeSingle: vi.fn(async () => {
        const [row] = matches(call.filters);
        if (call.op === 'select' && row && options.staleLookupWsId) {
          return {
            data: { ...row, ws_id: options.staleLookupWsId },
            error: null,
          };
        }
        return { data: row ?? null, error: null };
      }),
      single: vi.fn(async () => {
        const [row] = settle();
        return row
          ? { data: row, error: null }
          : { data: null, error: { code: 'PGRST116' } };
      }),
      // biome-ignore lint/suspicious/noThenProperty: mirrors the awaitable Supabase builder.
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: settle(), error: null }),
    };

    return builder;
  });

  return {
    supabase: { from },
    table,
    writes: () => calls.filter((call) => call.op !== 'select'),
  };
}

function deleteRequest(id: string) {
  return new Request(`http://localhost/api/v1/calendar/connections?id=${id}`, {
    method: 'DELETE',
  });
}

function patchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/v1/calendar/connections', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  });
}

const TABLE: Row[] = [
  { id: OWN_CONNECTION_ID, ws_id: WS_A },
  { id: FOREIGN_CONNECTION_ID, ws_id: WS_B },
];

describe('calendar connections route workspace scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeWorkspaceIdMock.mockImplementation(async (wsId: string) => wsId);
    // The caller belongs to workspace A only.
    verifyWorkspaceMembershipTypeMock.mockImplementation(
      async ({ wsId }: { wsId: string }) =>
        wsId === WS_A ? { ok: true } : { ok: false, error: 'not_member' }
    );
  });

  function authenticate(supabase: unknown) {
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase,
      user: { id: 'user-a' },
    });
  }

  describe('DELETE', () => {
    it('deletes a caller-workspace connection, scoped by id and ws_id', async () => {
      const { supabase, table, writes } = createSupabaseMock(TABLE);
      authenticate(supabase);

      const response = await DELETE(deleteRequest(OWN_CONNECTION_ID));

      expect(response.status).toBe(200);
      expect(writes()).toEqual([
        {
          op: 'delete',
          filters: [
            ['id', OWN_CONNECTION_ID],
            ['ws_id', WS_A],
          ],
        },
      ]);
      expect(table).toEqual([{ id: FOREIGN_CONNECTION_ID, ws_id: WS_B }]);
    });

    it('returns 403 and deletes nothing for another workspace connection', async () => {
      const { supabase, table, writes } = createSupabaseMock(TABLE);
      authenticate(supabase);

      const response = await DELETE(deleteRequest(FOREIGN_CONNECTION_ID));

      expect(response.status).toBe(403);
      expect(writes()).toEqual([]);
      expect(table).toHaveLength(2);
    });

    it('affects 0 rows and returns 404 when the lookup is stale for another workspace row', async () => {
      // The lookup claims workspace A, but the row belongs to workspace B.
      const { supabase, table, writes } = createSupabaseMock(TABLE, {
        staleLookupWsId: WS_A,
      });
      authenticate(supabase);

      const response = await DELETE(deleteRequest(FOREIGN_CONNECTION_ID));

      expect(response.status).toBe(404);
      expect(writes()).toEqual([
        {
          op: 'delete',
          filters: [
            ['id', FOREIGN_CONNECTION_ID],
            ['ws_id', WS_A],
          ],
        },
      ]);
      expect(table).toEqual(TABLE);
    });
  });

  describe('PATCH', () => {
    it('scopes the update to the connection workspace', async () => {
      const { supabase, writes } = createSupabaseMock(TABLE);
      authenticate(supabase);

      const response = await PATCH(
        patchRequest({ id: OWN_CONNECTION_ID, isEnabled: false })
      );

      expect(response.status).toBe(200);
      expect(writes()).toEqual([
        {
          op: 'update',
          filters: [
            ['ws_id', WS_A],
            ['id', OWN_CONNECTION_ID],
          ],
        },
      ]);
    });

    it('returns 404 and writes nothing for a foreign id with a caller wsId', async () => {
      const { supabase, writes } = createSupabaseMock(TABLE);
      authenticate(supabase);

      const response = await PATCH(
        patchRequest({
          id: FOREIGN_CONNECTION_ID,
          wsId: WS_A,
          isEnabled: false,
        })
      );

      expect(response.status).toBe(404);
      expect(writes()).toEqual([]);
    });
  });
});
