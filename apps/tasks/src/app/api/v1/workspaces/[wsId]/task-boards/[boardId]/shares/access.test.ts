import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  deleted: vi.fn(),
  inserted: vi.fn(),
  resolve: vi.fn(),
  updated: vi.fn(),
}));

const SHARE_ROW = {
  id: '22222222-2222-4222-8222-222222222222',
  permission: 'edit',
  shared_with_email: 'guest@example.com',
  shared_with_user_id: null,
  users: null,
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      if (table === 'user_private_details') {
        const lookup = {
          select: () => lookup,
          eq: () => lookup,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return lookup;
      }
      const shares = {
        select: () => shares,
        eq: () => shares,
        order: () => shares,
        limit: async () => ({ data: [], error: null }),
        insert: (row: unknown) => {
          m.inserted(row);
          return shares;
        },
        update: (row: unknown) => {
          m.updated(row);
          return shares;
        },
        delete: () => {
          m.deleted();
          return shares;
        },
        maybeSingle: async () => ({ data: SHARE_ROW, error: null }),
      };
      // Awaiting the chain directly (list, delete) resolves to an empty result.
      Object.defineProperty(shares, 'then', {
        value: (resolve: (value: unknown) => unknown) =>
          resolve({ data: [], error: null }),
      });
      return shares;
    },
  }),
}));
vi.mock('@tuturuuu/tasks-api/server/board-access', () => ({
  normalizeTaskBoardShareEmail: (email: string) => email.trim().toLowerCase(),
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

import { DELETE, GET, PATCH, POST } from './route';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';

const grant = (mode: 'member' | 'guest', permission: 'view' | 'edit') => ({
  access: { mode, permission },
  boardId: BOARD_ID,
  wsId: 'workspace',
});

const call = (
  handler: typeof GET,
  method: string,
  { body, query = '' }: { body?: unknown; query?: string } = {}
) =>
  handler(
    new NextRequest(`https://example.test/shares${query}`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ wsId: 'workspace', boardId: BOARD_ID }) }
  );

const requests = {
  POST: () =>
    call(POST, 'POST', {
      body: { email: 'guest@example.com', permission: 'edit' },
    }),
  PATCH: () =>
    call(PATCH, 'PATCH', {
      body: { shareId: SHARE_ROW.id, permission: 'view' },
    }),
  DELETE: () => call(DELETE, 'DELETE', { query: `?shareId=${SHARE_ROW.id}` }),
};

describe.each([
  ['POST', 'inserted'],
  ['PATCH', 'updated'],
  ['DELETE', 'deleted'],
] as const)('board shares %s', (method, write) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies an edit-share guest before any write', async () => {
    m.resolve.mockResolvedValue(grant('guest', 'edit'));
    expect((await requests[method]()).status).toBe(403);
    expect(m.inserted).not.toHaveBeenCalled();
    expect(m.updated).not.toHaveBeenCalled();
    expect(m.deleted).not.toHaveBeenCalled();
  });

  it('propagates a resolver denial', async () => {
    m.resolve.mockResolvedValue({
      error: Response.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });
    expect((await requests[method]()).status).toBe(403);
    expect(m[write]).not.toHaveBeenCalled();
  });

  it('requires edit board access', async () => {
    m.resolve.mockResolvedValue(grant('member', 'edit'));
    await requests[method]();
    expect(m.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ requiredPermission: 'edit' })
    );
  });

  it('allows a workspace member with manage_projects (member edit access)', async () => {
    m.resolve.mockResolvedValue(grant('member', 'edit'));
    expect((await requests[method]()).status).toBe(200);
    expect(m[write]).toHaveBeenCalledTimes(1);
  });
});

describe('board shares GET', () => {
  it('keeps view access for reads', async () => {
    m.resolve.mockResolvedValue(grant('guest', 'view'));
    expect((await call(GET, 'GET')).status).toBe(200);
    expect(m.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ requiredPermission: 'view' })
    );
  });
});
