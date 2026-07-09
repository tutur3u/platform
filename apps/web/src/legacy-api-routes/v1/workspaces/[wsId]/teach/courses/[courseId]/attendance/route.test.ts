import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const COURSE_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => {
  const requireTeachWorkspaceAccess = vi.fn();
  const validateTeachCourse = vi.fn();
  const attendanceQuery = {
    eq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    select: vi.fn(),
  };
  const sbAdmin = {
    from: vi.fn(),
  };

  return {
    attendanceQuery,
    requireTeachWorkspaceAccess,
    sbAdmin,
    validateTeachCourse,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> | unknown }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: { supabase: unknown; user: { id: string } },
          params: { courseId: string; wsId: string }
        ) => Promise<Response>
      )(
        request,
        { supabase: {}, user: { id: 'user-1' } },
        (await Promise.resolve(routeContext?.params)) as {
          courseId: string;
          wsId: string;
        }
      ),
}));

vi.mock('@tuturuuu/education-core/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
  validateTeachCourse: (
    ...args: Parameters<typeof mocks.validateTeachCourse>
  ) => mocks.validateTeachCourse(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

function requestFor(query: string) {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/ws-1/teach/courses/${COURSE_ID}/attendance?${query}`
  );
}

function routeContext() {
  return {
    params: { courseId: COURSE_ID, wsId: 'ws-1' },
  };
}

describe('Teach course attendance route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.attendanceQuery.select.mockReturnValue(mocks.attendanceQuery);
    mocks.attendanceQuery.eq.mockReturnValue(mocks.attendanceQuery);
    mocks.attendanceQuery.gte.mockReturnValue(mocks.attendanceQuery);
    mocks.attendanceQuery.lt.mockResolvedValue({
      data: [
        {
          date: '2026-05-02',
          notes: 'Checked in late',
          status: 'LATE',
          user_id: 'user-1',
        },
        {
          date: '2026-05-02',
          notes: '',
          status: 'PRESENT',
          user_id: 'user-2',
        },
      ],
      error: null,
    });
    mocks.sbAdmin.from.mockReturnValue(mocks.attendanceQuery);
    mocks.requireTeachWorkspaceAccess.mockResolvedValue({
      normalizedWsId: 'ws-1',
      sbAdmin: mocks.sbAdmin,
    });
    mocks.validateTeachCourse.mockResolvedValue({ id: COURSE_ID });
  });

  it('rejects an invalid month even when date is valid', async () => {
    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/teach/courses/[courseId]/attendance/route'
    );

    const response = await GET(
      requestFor('date=2026-05-17&month=not-a-month'),
      {
        params: Promise.resolve(routeContext().params),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Invalid month',
    });
    expect(mocks.requireTeachWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.sbAdmin.from).not.toHaveBeenCalled();
  });

  it('keeps valid monthly attendance aggregation working', async () => {
    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/teach/courses/[courseId]/attendance/route'
    );

    const response = await GET(requestFor('month=2026-05'), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      days: [
        {
          absent: 0,
          date: '2026-05-02',
          late: 1,
          notes: 1,
          present: 1,
          totalMarked: 2,
        },
      ],
    });
    expect(mocks.attendanceQuery.gte).toHaveBeenCalledWith(
      'date',
      '2026-05-01'
    );
    expect(mocks.attendanceQuery.lt).toHaveBeenCalledWith('date', '2026-06-01');
  });
});
