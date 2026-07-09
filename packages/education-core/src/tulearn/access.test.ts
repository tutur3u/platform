import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTulearnBootstrap } from './access';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
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

describe('getTulearnBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes education workspaces where the user is linked as a learner but not a workspace member', async () => {
    const admin = createSupabaseMock({
      tulearn_parent_student_links: [{ data: [], error: null }],
      workspace_user_linked_users: [
        {
          data: [{ virtual_user_id: 'student-1', ws_id: 'ws-linked' }],
          error: null,
        },
      ],
      workspaces: [
        { data: [], error: null },
        {
          data: [
            {
              avatar_url: null,
              id: 'ws-linked',
              logo_url: null,
              name: 'Linked Classroom',
            },
          ],
          error: null,
        },
      ],
    });
    const requestSupabase = createSupabaseMock({
      user_private_details: [
        {
          data: { email: 'learner@example.com', full_name: 'Learner Example' },
          error: null,
        },
      ],
      users: [
        {
          data: {
            avatar_url: null,
            display_name: 'Learner',
            id: 'user-1',
          },
          error: null,
        },
      ],
    });

    mocks.createAdminClient.mockResolvedValue(admin);

    const bootstrap = await getTulearnBootstrap({
      requestSupabase: requestSupabase as never,
      user: {
        email: 'learner@example.com',
        id: 'user-1',
      } as SupabaseUser,
    });

    expect(bootstrap.workspaces).toEqual([
      {
        avatar_url: null,
        id: 'ws-linked',
        logo_url: null,
        name: 'Linked Classroom',
        roles: ['student'],
      },
    ]);
  });
});
