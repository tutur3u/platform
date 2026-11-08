import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS_ID = '00000000-0000-0000-0000-000000000001';
const MODULE_ID = '00000000-0000-0000-0000-0000000000a1';
const SET_ID = '00000000-0000-0000-0000-0000000000b1';

type RouteMocks = ReturnType<typeof createRouteMocks>;

let mocks: RouteMocks;

function createRouteMocks() {
  const moduleLookup: Record<string, any> = {};
  moduleLookup.select = vi.fn(() => moduleLookup);
  moduleLookup.eq = vi.fn(() => moduleLookup);
  moduleLookup.maybeSingle = vi.fn();

  const setInsert: Record<string, any> = {};
  setInsert.select = vi.fn(() => setInsert);
  setInsert.single = vi.fn();
  const quizSetsTable = { insert: vi.fn(() => setInsert) };

  const linkTable = { insert: vi.fn(async () => ({ error: null })) };

  const sbAdmin = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_course_modules') return moduleLookup;
      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  const sessionSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_quiz_sets') return quizSetsTable;
      if (table === 'course_module_quiz_sets') return linkTable;
      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  return { linkTable, moduleLookup, quizSetsTable, sbAdmin, sessionSupabase };
}

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: {
            user: { id: string };
            supabase: typeof mocks.sessionSupabase;
          },
          params: { wsId: string }
        ) => Promise<Response>
      )(
        request,
        { user: { id: 'user-1' }, supabase: mocks.sessionSupabase },
        (await routeContext?.params) as { wsId: string }
      ),
}));

vi.mock('@tuturuuu/education-core/education/access', () => ({
  requireEducationWorkspaceAccess: async () => ({
    normalizedWsId: WS_ID,
    sbAdmin: mocks.sbAdmin,
  }),
}));

async function postQuizSet(body: Record<string, unknown>) {
  const { POST } = await import('./route');
  return POST(
    new NextRequest('http://localhost/api/v1/workspaces/ws-1/quiz-sets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ wsId: 'ws-1' }) }
  );
}

describe('workspace quiz sets route POST module link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks = createRouteMocks();
    mocks.quizSetsTable.insert().single.mockResolvedValue({
      data: { id: SET_ID, ws_id: WS_ID },
      error: null,
    });
    mocks.quizSetsTable.insert.mockClear();
  });

  it('returns 404 and writes nothing for a module outside the workspace', async () => {
    mocks.moduleLookup.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const response = await postQuizSet({ moduleId: MODULE_ID, name: 'Set' });

    expect(response.status).toBe(404);
    expect(mocks.moduleLookup.eq).toHaveBeenCalledWith('id', MODULE_ID);
    expect(mocks.moduleLookup.eq).toHaveBeenCalledWith(
      'workspace_user_groups.ws_id',
      WS_ID
    );
    expect(mocks.quizSetsTable.insert).not.toHaveBeenCalled();
    expect(mocks.linkTable.insert).not.toHaveBeenCalled();
  });

  it('links a module that belongs to the workspace', async () => {
    mocks.moduleLookup.maybeSingle.mockResolvedValue({
      data: { id: MODULE_ID },
      error: null,
    });

    const response = await postQuizSet({ moduleId: MODULE_ID, name: 'Set' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'success',
      id: SET_ID,
    });
    expect(mocks.quizSetsTable.insert).toHaveBeenCalledWith({
      name: 'Set',
      ws_id: WS_ID,
    });
    expect(mocks.linkTable.insert).toHaveBeenCalledWith({
      module_id: MODULE_ID,
      set_id: SET_ID,
    });
  });

  it('returns 500 and writes nothing when the module lookup fails', async () => {
    mocks.moduleLookup.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    const response = await postQuizSet({ moduleId: MODULE_ID, name: 'Set' });

    expect(response.status).toBe(500);
    expect(mocks.quizSetsTable.insert).not.toHaveBeenCalled();
    expect(mocks.linkTable.insert).not.toHaveBeenCalled();
  });

  it('returns 404 without linking when the quiz set is not in the workspace', async () => {
    mocks.moduleLookup.maybeSingle.mockResolvedValue({
      data: { id: MODULE_ID },
      error: null,
    });
    mocks.quizSetsTable.insert().single.mockResolvedValue({
      data: { id: SET_ID, ws_id: '00000000-0000-0000-0000-0000000000ff' },
      error: null,
    });
    mocks.quizSetsTable.insert.mockClear();

    const response = await postQuizSet({ moduleId: MODULE_ID, name: 'Set' });

    expect(response.status).toBe(404);
    expect(mocks.linkTable.insert).not.toHaveBeenCalled();
  });

  it('creates a set without any module lookup when no module is supplied', async () => {
    const response = await postQuizSet({ name: 'Set' });

    expect(response.status).toBe(200);
    expect(mocks.sbAdmin.from).not.toHaveBeenCalled();
    expect(mocks.linkTable.insert).not.toHaveBeenCalled();
  });
});
