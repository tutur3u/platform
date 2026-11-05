import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  insert: vi.fn(),
  resolve: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      if (table === 'workspace_boards') {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            data: {
              id: 'board',
              ws_id: 'workspace',
              archived_at: null,
              deleted_at: null,
            },
            error: null,
          }),
        };
        return query;
      }
      const links = {
        select: () => links,
        eq: () => links,
        insert: (row: unknown) => {
          m.insert(row);
          return links;
        },
        update: (row: unknown) => {
          m.update(row);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
        maybeSingle: async () => ({
          data: { id: 'link', board_id: 'board', code: 'c', enabled: true },
          error: null,
        }),
      };
      return links;
    },
  }),
}));
vi.mock('@tuturuuu/tasks-api/server/board-access', () => ({
  resolveTaskBoardAccess: m.resolve,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async (id: string) => id,
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: Request,
        auth: unknown,
        params: unknown
      ) => Promise<Response>
    ) =>
    async (request: Request, context: { params: Promise<unknown> }) =>
      handler(
        request,
        { supabase: {}, user: { id: 'actor' } },
        await context.params
      ),
}));

import { DELETE, GET, POST } from './route';

const grant = (mode: 'member' | 'guest', permission: 'view' | 'edit') => ({
  access: { mode, permission },
  boardId: 'board',
  wsId: 'workspace',
});

const call = (handler: typeof GET) =>
  handler(new NextRequest('https://example.test', { method: 'POST' }), {
    params: Promise.resolve({
      wsId: 'workspace',
      boardId: '11111111-1111-4111-8111-111111111111',
    }),
  });

describe.each([
  ['POST', POST, 'insert'],
  ['DELETE', DELETE, 'update'],
] as const)('public link %s', (_, handler, write) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies an edit-share guest before any write', async () => {
    m.resolve.mockResolvedValue(grant('guest', 'edit'));
    expect((await call(handler)).status).toBe(403);
    expect(m[write]).not.toHaveBeenCalled();
  });

  it('propagates a resolver denial', async () => {
    m.resolve.mockResolvedValue({
      error: Response.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });
    expect((await call(handler)).status).toBe(403);
    expect(m[write]).not.toHaveBeenCalled();
  });

  it('requires edit board access', async () => {
    m.resolve.mockResolvedValue(grant('member', 'edit'));
    await call(handler);
    expect(m.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ requiredPermission: 'edit' })
    );
  });

  it('allows a workspace member with edit access', async () => {
    m.resolve.mockResolvedValue(grant('member', 'edit'));
    expect((await call(handler)).status).toBe(200);
  });
});

describe('public link GET', () => {
  it('still lets a view-share guest read the link', async () => {
    m.resolve.mockResolvedValue(grant('guest', 'view'));
    expect((await call(GET)).status).toBe(200);
    expect(m.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ requiredPermission: 'view' })
    );
  });
});
