import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBoardAccessMock = vi.fn();
const sessionSupabase = { from: vi.fn() };
const sessionUser = { id: 'user-1' };

vi.mock('@tuturuuu/auth/cli-session', () => ({
  CLI_APP_TARGET_APP: 'platform',
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: () => null,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    <T>(
      handler: (
        request: NextRequest,
        context: { supabase: typeof sessionSupabase; user: typeof sessionUser },
        params: T
      ) => Promise<Response> | Response
    ) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<T> | T }
    ) => {
      const params = routeContext?.params
        ? await Promise.resolve(routeContext.params)
        : ({} as T);
      return handler(
        request,
        { supabase: sessionSupabase, user: sessionUser },
        params
      );
    },
}));

vi.mock('./lists/access', () => ({
  requireBoardAccess: (...args: Parameters<typeof requireBoardAccessMock>) =>
    requireBoardAccessMock(...args),
}));

import { GET } from './route';

const BOARD_ID = '11111111-1111-1111-1111-111111111111';

function buildRequest() {
  return new NextRequest(
    'https://app.tuturuuu.com/api/v1/workspaces/ws-1/task-boards/board'
  );
}

function routeContext() {
  return { params: Promise.resolve({ wsId: 'ws-1', boardId: BOARD_ID }) };
}

function mockBoardAccess(maybeSingle: ReturnType<typeof vi.fn>) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle,
  };
  requireBoardAccessMock.mockResolvedValue({
    boardId: BOARD_ID,
    sbAdmin: { from: vi.fn(() => query) },
    access: { mode: 'member', permission: null },
  });
  return query;
}

describe('task board GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the board with its default_list_id when the column exists', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: BOARD_ID,
        ws_id: 'ws-1',
        name: 'Roadmap',
        default_list_id: 'list-2',
        task_lists: [{ id: 'list-1', position: 0, created_at: null }],
      },
      error: null,
    });
    mockBoardAccess(maybeSingle);

    const res = await GET(buildRequest(), routeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.board.default_list_id).toBe('list-2');
    // Only the primary (with default_list_id) select should run.
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('still loads the board when default_list_id is not migrated yet (rollout-safe)', async () => {
    const maybeSingle = vi
      .fn()
      // Primary select referencing default_list_id fails: undefined_column.
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '42703',
          message: 'column workspace_boards.default_list_id does not exist',
        },
      })
      // Fallback select without the column succeeds.
      .mockResolvedValueOnce({
        data: {
          id: BOARD_ID,
          ws_id: 'ws-1',
          name: 'Roadmap',
          task_lists: [{ id: 'list-1', position: 0, created_at: null }],
        },
        error: null,
      });
    mockBoardAccess(maybeSingle);

    const res = await GET(buildRequest(), routeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.board.default_list_id).toBeNull();
    expect(body.board.name).toBe('Roadmap');
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('returns 500 when the query fails for an unrelated reason', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    });
    mockBoardAccess(maybeSingle);

    const res = await GET(buildRequest(), routeContext());

    expect(res.status).toBe(500);
    // Unrelated errors must not trigger the fallback retry.
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });
});
