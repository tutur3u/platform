import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ resolve: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ rpc: m.rpc, from: m.from }),
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

import { GET as shares } from './shares/route';
import { GET as members } from './viewable-members/route';

describe.each([
  ['members', members],
  ['shares', shares],
] as const)('%s directory', (_, handler) => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.rpc.mockResolvedValue({ data: [], error: null });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    m.from.mockReturnValue(query);
  });
  const run = () =>
    handler(new NextRequest('https://example.test'), {
      params: Promise.resolve({
        wsId: 'workspace',
        boardId: '11111111-1111-4111-8111-111111111111',
      }),
    });
  it.each(['view', 'edit'])(
    'denies %s guests before loading private directory data',
    async (permission) => {
      m.resolve.mockResolvedValue({
        boardId: 'board',
        wsId: 'workspace',
        access: { mode: 'guest', permission },
      });
      expect((await run()).status).toBe(403);
      expect(m.rpc).not.toHaveBeenCalled();
      expect(m.from).not.toHaveBeenCalled();
    }
  );
  it('allows workspace members', async () => {
    m.resolve.mockResolvedValue({
      boardId: 'board',
      wsId: 'workspace',
      access: { mode: 'member', permission: 'view' },
    });
    expect((await run()).status).toBe(200);
  });
});
