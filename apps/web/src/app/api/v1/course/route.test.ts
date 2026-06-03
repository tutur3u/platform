import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getLearnerCourseDetail: vi.fn(),
  getLearnerCourseSummaries: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  resolveStudentForPlatformUser: vi.fn(),
  resolveTulearnSubject: vi.fn(),
  serverLogger: {
    error: vi.fn(),
  },
  tulearnAccessErrorResponse: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (
    ...args: Parameters<typeof mocks.resolveSessionAuthContext>
  ) => mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@/lib/tulearn/service', () => ({
  getLearnerCourseDetail: (
    ...args: Parameters<typeof mocks.getLearnerCourseDetail>
  ) => mocks.getLearnerCourseDetail(...args),
  getLearnerCourseSummaries: (
    ...args: Parameters<typeof mocks.getLearnerCourseSummaries>
  ) => mocks.getLearnerCourseSummaries(...args),
  resolveStudentForPlatformUser: (
    ...args: Parameters<typeof mocks.resolveStudentForPlatformUser>
  ) => mocks.resolveStudentForPlatformUser(...args),
  resolveTulearnSubject: (
    ...args: Parameters<typeof mocks.resolveTulearnSubject>
  ) => mocks.resolveTulearnSubject(...args),
  tulearnAccessErrorResponse: (
    ...args: Parameters<typeof mocks.tulearnAccessErrorResponse>
  ) => mocks.tulearnAccessErrorResponse(...args),
}));

type QueryResult = {
  data: unknown;
  error: null;
};

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  };

  Object.defineProperty(query, 'then', {
    value: (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  });

  return query as typeof query & PromiseLike<QueryResult>;
}

function createSupabaseMock(resultsByTable: Record<string, QueryResult[]>) {
  return {
    from: vi.fn((table: string) => {
      const result = resultsByTable[table]?.shift();

      if (!result) {
        throw new Error(`Unexpected Supabase table query: ${table}`);
      }

      return createQuery(result);
    }),
  };
}

describe('course API app-session access', () => {
  let admin: { from: ReturnType<typeof vi.fn> };
  let requestSupabase: { from: ReturnType<typeof vi.fn> };
  let user: { email: string; id: string };

  beforeEach(() => {
    vi.clearAllMocks();
    admin = { from: vi.fn() };
    requestSupabase = { from: vi.fn() };
    user = { email: 'learner@example.com', id: 'learner-1' };
    mocks.createClient.mockResolvedValue({ from: vi.fn() });
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: requestSupabase,
      user,
    });
    mocks.resolveTulearnSubject.mockResolvedValue({
      readOnly: false,
      role: 'student',
      studentName: 'Learner',
      studentPlatformUserId: 'learner-1',
      studentWorkspaceUserId: 'virtual-user-1',
      wsId: 'ws-1',
    });
    mocks.getLearnerCourseSummaries.mockResolvedValue([
      {
        completedModules: 1,
        description: 'Intro course',
        id: 'course-1',
        name: 'Physics',
        progress: 100,
        totalModules: 1,
      },
    ]);
    mocks.resolveStudentForPlatformUser.mockResolvedValue({
      avatar_url: null,
      email: 'learner@example.com',
      id: 'virtual-user-1',
      name: 'Learner',
      platform_user_id: 'learner-1',
      workspace_id: 'ws-1',
      workspace_user_id: 'virtual-user-1',
    });
    mocks.tulearnAccessErrorResponse.mockReturnValue(null);
  });

  it('lists learner-assigned courses through the Tulearn subject', async () => {
    const request = new Request('http://localhost/api/v1/course?wsId=ws-1');
    const response = await GET(request);

    await expect(response.json()).resolves.toEqual({
      courses: [
        {
          completedModules: 1,
          description: 'Intro course',
          id: 'course-1',
          name: 'Physics',
          progress: 100,
          totalModules: 1,
        },
      ],
    });
    expect(response.status).toBe(200);
    expect(mocks.resolveTulearnSubject).toHaveBeenCalledWith({
      requestSupabase,
      studentId: undefined,
      user,
      wsId: 'ws-1',
    });
    expect(mocks.getLearnerCourseSummaries).toHaveBeenCalledWith({
      db: admin,
      studentPlatformUserId: 'learner-1',
      studentWorkspaceUserId: 'virtual-user-1',
      wsId: 'ws-1',
    });
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(request, {
      allowAppSessionAuth: true,
    });
    expect(requestSupabase.from).not.toHaveBeenCalled();
  });

  it('forwards the requested linked student id to subject resolution', async () => {
    const studentId = '00000000-0000-4000-8000-000000000001';
    const request = new Request(
      `http://localhost/api/v1/course?wsId=ws-1&studentId=${studentId}`
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.resolveTulearnSubject).toHaveBeenCalledWith({
      requestSupabase,
      studentId,
      user,
      wsId: 'ws-1',
    });
  });

  it('does not fall back to workspace membership when no Tulearn subject exists', async () => {
    const accessError = new Error('no learner access');
    mocks.resolveTulearnSubject.mockRejectedValueOnce(accessError);
    mocks.tulearnAccessErrorResponse.mockReturnValueOnce(
      new Response(JSON.stringify({ message: 'no learner access' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 403,
      })
    );
    const request = new Request('http://localhost/api/v1/course?wsId=ws-1');

    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(mocks.getLearnerCourseSummaries).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(requestSupabase.from).not.toHaveBeenCalled();
    expect(mocks.tulearnAccessErrorResponse).toHaveBeenCalledWith(accessError);
  });

  it('does not fall back to workspace membership for unassigned self-learner course details', async () => {
    const courseId = '00000000-0000-4000-8000-000000000002';
    admin = createSupabaseMock({
      workspace_user_groups: [
        {
          data: {
            description: 'Private course',
            id: courseId,
            name: 'Chemistry',
            ws_id: 'ws-1',
          },
          error: null,
        },
      ],
    });
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.getLearnerCourseDetail.mockResolvedValueOnce(null);

    const request = new Request(
      `http://localhost/api/v1/course?courseId=${courseId}`
    );
    const response = await GET(request);

    await expect(response.json()).resolves.toEqual({
      error: 'Course not found',
    });
    expect(response.status).toBe(404);
    expect(mocks.getLearnerCourseDetail).toHaveBeenCalledWith({
      courseId,
      db: admin,
      studentPlatformUserId: 'learner-1',
      studentWorkspaceUserId: 'virtual-user-1',
      wsId: 'ws-1',
    });
    expect(requestSupabase.from).not.toHaveBeenCalled();
  });
});
