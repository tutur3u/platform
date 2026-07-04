import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const ids = {
    actorId: '44444444-4444-4444-8444-444444444444',
    courseId: '33333333-3333-4333-8333-333333333333',
    indicatorId: '11111111-1111-4111-8111-111111111111',
    platformUserId: '55555555-5555-4555-8555-555555555555',
    routeWorkspaceId: 'personal',
    userId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '00000000-0000-4000-8000-000000000001',
  };

  const state = {
    indicatorError: null as Error | null,
    indicatorRows: [] as { id: string }[],
    memberError: null as Error | null,
    memberRows: [] as { user_id: string }[],
    upsertError: null as Error | null,
  };

  const queries: Record<string, any> = {};

  function createIndicatorQuery() {
    const query: any = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.in = vi.fn(() =>
      Promise.resolve({
        data: state.indicatorRows,
        error: state.indicatorError,
      })
    );
    return query;
  }

  function createMemberQuery() {
    const query: any = {};
    let eqCalls = 0;
    query.select = vi.fn(() => query);
    query.in = vi.fn(() => query);
    query.eq = vi.fn(() => {
      eqCalls += 1;
      if (eqCalls < 3) return query;

      return Promise.resolve({
        data: state.memberRows,
        error: state.memberError,
      });
    });
    return query;
  }

  const upsert = vi.fn(() => Promise.resolve({ error: state.upsertError }));
  const sbAdmin = {
    from: vi.fn((table: string) => {
      if (table === 'user_group_metrics') {
        queries.indicators = createIndicatorQuery();
        return queries.indicators;
      }

      if (table === 'workspace_user_groups_users') {
        queries.members = createMemberQuery();
        return queries.members;
      }

      if (table === 'user_indicators') {
        return { upsert };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    getTeachActorWorkspaceUserId: vi.fn(),
    ids,
    queries,
    requireTeachWorkspaceAccess: vi.fn(),
    sbAdmin,
    serverLoggerError: vi.fn(),
    state,
    upsert,
    validateTeachCourse: vi.fn(),
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<{ courseId: string; wsId: string }> }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: { user: { id: string }; supabase: unknown },
          params: { courseId: string; wsId: string }
        ) => Promise<Response>
      )(
        request,
        { supabase: {}, user: { id: mocks.ids.platformUserId } },
        routeContext?.params
          ? await routeContext.params
          : { courseId: mocks.ids.courseId, wsId: mocks.ids.routeWorkspaceId }
      ),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverLoggerError,
  },
}));

vi.mock('@/lib/teach/api', () => ({
  getTeachActorWorkspaceUserId: (
    ...args: Parameters<typeof mocks.getTeachActorWorkspaceUserId>
  ) => mocks.getTeachActorWorkspaceUserId(...args),
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
  validateTeachCourse: (
    ...args: Parameters<typeof mocks.validateTeachCourse>
  ) => mocks.validateTeachCourse(...args),
}));

async function patchIndicatorValues(
  values: { indicator_id: string; user_id: string; value: number | null }[]
) {
  const { PATCH } = await import(
    '@/legacy-api-routes/v1/workspaces/[wsId]/teach/courses/[courseId]/indicators/route'
  );

  return PATCH(
    new NextRequest(
      `http://localhost/api/v1/workspaces/${mocks.ids.routeWorkspaceId}/teach/courses/${mocks.ids.courseId}/indicators`,
      {
        body: JSON.stringify(values),
        method: 'PATCH',
      }
    ),
    {
      params: Promise.resolve({
        courseId: mocks.ids.courseId,
        wsId: mocks.ids.routeWorkspaceId,
      }),
    }
  );
}

describe('Teach course indicators route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.queries.indicators = undefined;
    mocks.queries.members = undefined;
    mocks.state.indicatorError = null;
    mocks.state.indicatorRows = [{ id: mocks.ids.indicatorId }];
    mocks.state.memberError = null;
    mocks.state.memberRows = [{ user_id: mocks.ids.userId }];
    mocks.state.upsertError = null;
    mocks.requireTeachWorkspaceAccess.mockResolvedValue({
      normalizedWsId: mocks.ids.workspaceId,
      sbAdmin: mocks.sbAdmin,
    });
    mocks.validateTeachCourse.mockResolvedValue({
      id: mocks.ids.courseId,
      ws_id: mocks.ids.workspaceId,
    });
    mocks.getTeachActorWorkspaceUserId.mockResolvedValue(mocks.ids.actorId);
  });

  it('rejects indicator ids that are not owned by the URL course workspace', async () => {
    mocks.state.indicatorRows = [];

    const response = await patchIndicatorValues([
      {
        indicator_id: mocks.ids.indicatorId,
        user_id: mocks.ids.userId,
        value: 8.5,
      },
    ]);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Indicator values must belong to this course',
    });
    expect(mocks.getTeachActorWorkspaceUserId).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rejects user ids that are not enrolled in the URL course workspace', async () => {
    mocks.state.memberRows = [];

    const response = await patchIndicatorValues([
      {
        indicator_id: mocks.ids.indicatorId,
        user_id: mocks.ids.userId,
        value: 8.5,
      },
    ]);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Indicator users must be enrolled in this course',
    });
    expect(mocks.getTeachActorWorkspaceUserId).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('upserts scores only after indicators and users are scoped to the URL course', async () => {
    const response = await patchIndicatorValues([
      {
        indicator_id: mocks.ids.indicatorId,
        user_id: mocks.ids.userId,
        value: 8.5,
      },
    ]);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });

    expect(mocks.queries.indicators.eq).toHaveBeenCalledWith(
      'ws_id',
      mocks.ids.workspaceId
    );
    expect(mocks.queries.indicators.eq).toHaveBeenCalledWith(
      'group_id',
      mocks.ids.courseId
    );
    expect(mocks.queries.indicators.in).toHaveBeenCalledWith('id', [
      mocks.ids.indicatorId,
    ]);
    expect(mocks.queries.members.eq).toHaveBeenCalledWith(
      'group_id',
      mocks.ids.courseId
    );
    expect(mocks.queries.members.select).toHaveBeenCalledWith(
      'user_id, workspace_users!workspace_user_roles_users_user_id_fkey!inner(id)'
    );
    expect(mocks.queries.members.eq).toHaveBeenCalledWith(
      'workspace_users.ws_id',
      mocks.ids.workspaceId
    );
    expect(mocks.queries.members.eq).toHaveBeenCalledWith(
      'workspace_users.archived',
      false
    );
    expect(mocks.queries.members.in).toHaveBeenCalledWith('user_id', [
      mocks.ids.userId,
    ]);
    expect(mocks.upsert).toHaveBeenCalledWith([
      {
        creator_id: mocks.ids.actorId,
        indicator_id: mocks.ids.indicatorId,
        user_id: mocks.ids.userId,
        value: 8.5,
      },
    ]);
  });
});
