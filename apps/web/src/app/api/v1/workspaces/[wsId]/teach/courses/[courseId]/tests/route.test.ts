import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const ids = {
    courseId: '33333333-3333-4333-8333-333333333333',
    moduleIdA: '11111111-1111-4111-8111-111111111111',
    moduleIdB: '22222222-2222-4222-8222-222222222222',
    routeWorkspaceId: 'personal',
    testId: '44444444-4444-4444-8444-444444444444',
    workspaceId: '00000000-0000-4000-8000-000000000001',
  };

  const state = {
    selectedModuleError: null as Error | null,
    selectedModuleRows: [] as { id: string }[],
    updatedTest: { id: ids.testId } as { id: string } | null,
    updateError: null as Error | null,
  };

  const selectedModulesQuery = {
    eq: vi.fn(() => selectedModulesQuery),
    in: vi.fn(() =>
      Promise.resolve({
        data: state.selectedModuleRows,
        error: state.selectedModuleError,
      })
    ),
    select: vi.fn(() => selectedModulesQuery),
  };

  const courseTestsQuery = {
    eq: vi.fn(() => courseTestsQuery),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: state.updatedTest,
        error: state.updateError,
      })
    ),
    select: vi.fn(() => courseTestsQuery),
    update: vi.fn(() => courseTestsQuery),
  };

  const sbAdmin = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_course_modules') return selectedModulesQuery;
      if (table === 'course_tests') return courseTestsQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn(() =>
      Promise.resolve({
        data: ids.testId,
        error: null,
      })
    ),
  };

  return {
    courseTestsQuery,
    ids,
    requireTeachWorkspaceAccess: vi.fn(),
    sbAdmin,
    selectedModulesQuery,
    state,
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
        { supabase: {}, user: { id: 'user-1' } },
        routeContext?.params
          ? await routeContext.params
          : { courseId: mocks.ids.courseId, wsId: mocks.ids.routeWorkspaceId }
      ),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
  validateTeachCourse: (
    ...args: Parameters<typeof mocks.validateTeachCourse>
  ) => mocks.validateTeachCourse(...args),
}));

async function postCourseTest(moduleIds: string[]) {
  const { POST } = await import(
    '@/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/tests/route'
  );

  return POST(
    new NextRequest(
      `http://localhost/api/v1/workspaces/${mocks.ids.routeWorkspaceId}/teach/courses/${mocks.ids.courseId}/tests`,
      {
        body: JSON.stringify({
          durationInMinutes: 60,
          moduleIds,
          name: 'Midterm',
        }),
        method: 'POST',
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

async function patchCourseTest(payload: Record<string, unknown>) {
  const { PATCH } = await import(
    '@/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/tests/route'
  );

  return PATCH(
    new NextRequest(
      `http://localhost/api/v1/workspaces/${mocks.ids.routeWorkspaceId}/teach/courses/${mocks.ids.courseId}/tests`,
      {
        body: JSON.stringify(payload),
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

describe('Teach course tests route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.state.selectedModuleError = null;
    mocks.state.selectedModuleRows = [
      { id: mocks.ids.moduleIdA },
      { id: mocks.ids.moduleIdB },
    ];
    mocks.state.updatedTest = { id: mocks.ids.testId };
    mocks.state.updateError = null;
    mocks.requireTeachWorkspaceAccess.mockResolvedValue({
      normalizedWsId: mocks.ids.workspaceId,
      sbAdmin: mocks.sbAdmin,
    });
    mocks.validateTeachCourse.mockResolvedValue({
      id: mocks.ids.courseId,
      ws_id: mocks.ids.workspaceId,
    });
  });

  it('rejects module ids that do not belong to the URL course', async () => {
    mocks.state.selectedModuleRows = [{ id: mocks.ids.moduleIdA }];

    const response = await postCourseTest([
      mocks.ids.moduleIdA,
      mocks.ids.moduleIdB,
    ]);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Invalid course test module selection',
    });
    expect(mocks.sbAdmin.rpc).not.toHaveBeenCalled();
  });

  it('deduplicates module ids before validation and atomic creation', async () => {
    const response = await postCourseTest([
      mocks.ids.moduleIdA,
      mocks.ids.moduleIdA,
      mocks.ids.moduleIdB,
    ]);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: mocks.ids.testId });
    expect(mocks.selectedModulesQuery.eq).toHaveBeenCalledWith(
      'group_id',
      mocks.ids.courseId
    );
    expect(mocks.selectedModulesQuery.in).toHaveBeenCalledWith('id', [
      mocks.ids.moduleIdA,
      mocks.ids.moduleIdB,
    ]);
    expect(mocks.sbAdmin.rpc).toHaveBeenCalledWith(
      'create_course_test_with_modules',
      expect.objectContaining({
        p_course_id: mocks.ids.courseId,
        p_module_ids: [mocks.ids.moduleIdA, mocks.ids.moduleIdB],
        p_name: 'Midterm',
      })
    );
  });

  it('rejects empty PATCH updates before touching course_tests', async () => {
    const response = await patchCourseTest({ id: mocks.ids.testId });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'No fields provided to update',
    });
    expect(mocks.courseTestsQuery.update).not.toHaveBeenCalled();
  });

  it('returns 404 when PATCH does not match a course test in the URL course', async () => {
    mocks.state.updatedTest = null;

    const response = await patchCourseTest({
      id: mocks.ids.testId,
      is_published: true,
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'Course test not found',
    });
    expect(mocks.courseTestsQuery.eq).toHaveBeenCalledWith(
      'course_id',
      mocks.ids.courseId
    );
  });
});
