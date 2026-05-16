import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
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

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
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
    in: vi.fn(() => query),
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ from: vi.fn() });
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: { from: vi.fn() },
      user: { email: 'learner@example.com', id: 'learner-1' },
    });
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

  it('allows linked learners to list courses without direct workspace membership', async () => {
    const admin = createSupabaseMock({
      course_module_completion_status: [
        {
          data: [{ module_id: 'module-1' }],
          error: null,
        },
      ],
      workspace_course_modules: [
        {
          data: [
            {
              group_id: 'course-1',
              id: 'module-1',
            },
          ],
          error: null,
        },
      ],
      workspace_user_groups: [
        {
          data: [
            {
              description: 'Intro course',
              id: 'course-1',
              name: 'Physics',
            },
          ],
          error: null,
        },
      ],
    });
    mocks.createAdminClient.mockResolvedValue(admin);

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
    expect(mocks.resolveStudentForPlatformUser).toHaveBeenCalledWith({
      db: admin,
      platformUserId: 'learner-1',
      wsId: 'ws-1',
    });
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(request, {
      allowAppSessionAuth: true,
    });
    const groupsQuery = admin.from.mock.results[0]?.value;
    expect(groupsQuery.eq).toHaveBeenCalledWith('is_course_published', true);
  });

  it('keeps published courses visible even when they have no published modules yet', async () => {
    const admin = createSupabaseMock({
      workspace_course_modules: [
        {
          data: [],
          error: null,
        },
      ],
      workspace_user_groups: [
        {
          data: [
            {
              description: 'Draft module path',
              id: 'course-2',
              name: 'Chemistry',
            },
          ],
          error: null,
        },
      ],
    });
    mocks.createAdminClient.mockResolvedValue(admin);

    const request = new Request('http://localhost/api/v1/course?wsId=ws-1');
    const response = await GET(request);

    await expect(response.json()).resolves.toEqual({
      courses: [
        {
          completedModules: 0,
          description: 'Draft module path',
          id: 'course-2',
          name: 'Chemistry',
          progress: 0,
          totalModules: 0,
        },
      ],
    });
    expect(response.status).toBe(200);
  });
});
