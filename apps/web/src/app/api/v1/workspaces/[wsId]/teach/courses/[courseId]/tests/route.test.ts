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
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({
            data: { id: ids.testId },
            error: null,
          })
        ),
      })),
    })),
  };

  const courseTestModulesQuery = {
    insert: vi.fn(() => Promise.resolve({ error: null })),
  };

  const sbAdmin = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_course_modules') return selectedModulesQuery;
      if (table === 'course_tests') return courseTestsQuery;
      if (table === 'course_test_modules') return courseTestModulesQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    courseTestModulesQuery,
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

describe('Teach course tests route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.state.selectedModuleError = null;
    mocks.state.selectedModuleRows = [
      { id: mocks.ids.moduleIdA },
      { id: mocks.ids.moduleIdB },
    ];
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
    expect(mocks.courseTestsQuery.insert).not.toHaveBeenCalled();
    expect(mocks.courseTestModulesQuery.insert).not.toHaveBeenCalled();
  });

  it('deduplicates module ids before validation and association inserts', async () => {
    const response = await postCourseTest([
      mocks.ids.moduleIdA,
      mocks.ids.moduleIdA,
      mocks.ids.moduleIdB,
    ]);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: mocks.ids.testId });
    expect(mocks.selectedModulesQuery.in).toHaveBeenCalledWith('id', [
      mocks.ids.moduleIdA,
      mocks.ids.moduleIdB,
    ]);
    expect(mocks.courseTestModulesQuery.insert).toHaveBeenCalledWith([
      { module_id: mocks.ids.moduleIdA, test_id: mocks.ids.testId },
      { module_id: mocks.ids.moduleIdB, test_id: mocks.ids.testId },
    ]);
  });
});
