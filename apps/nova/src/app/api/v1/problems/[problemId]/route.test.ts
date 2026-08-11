import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { data: any; error: any };

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getRole: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: (...args: unknown[]) =>
    mocks.getUser(...args),
  getNovaPlatformRole: (...args: unknown[]) => mocks.getRole(...args),
}));

function query(result: QueryResult) {
  const builder = {
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => builder),
    single: vi.fn(async () => result),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
    then: (resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

function adminClient(tableQueries: Record<string, ReturnType<typeof query>[]>) {
  const queues = new Map(
    Object.entries(tableQueries).map(([table, queries]) => [
      table,
      [...queries],
    ])
  );
  const client = {
    from: vi.fn((table: string) => {
      const queued = queues.get(table);
      if (!queued?.length) throw new Error(`Unexpected table: ${table}`);
      return queued.shift();
    }),
    schema: vi.fn(() => client),
  };
  return client;
}

const participantRole = {
  allow_challenge_management: false,
  allow_manage_all_challenges: false,
  allow_role_management: false,
  enabled: true,
};

const assignedManagerRole = {
  ...participantRole,
  allow_challenge_management: true,
};

function challenge(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    id: 'challenge-1',
    previewable_at: '2020-01-01T00:00:00.000Z',
    whitelisted_only: false,
    ...overrides,
  };
}

async function getProblem(problemId = 'problem-1') {
  const { GET } = await import('./route');
  return GET(new Request(`https://nova.test/api/v1/problems/${problemId}`), {
    params: Promise.resolve({ problemId }),
  });
}

describe('Nova problem detail eligibility', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getUser.mockReturnValue({ email: 'user@example.com', id: 'user-1' });
    mocks.getRole.mockResolvedValue(participantRole);
  });

  it('rejects anonymous callers before creating an admin client', async () => {
    mocks.getUser.mockReturnValue(null);
    const response = await getProblem();
    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns full content to eligible participants with active sessions', async () => {
    const problem = {
      challenge_id: 'challenge-1',
      description: 'Problem content',
      id: 'problem-1',
    };
    mocks.createAdminClient.mockResolvedValue(
      adminClient({
        nova_challenges: [query({ data: challenge(), error: null })],
        nova_problems: [
          query({ data: { challenge_id: 'challenge-1' }, error: null }),
          query({ data: problem, error: null }),
        ],
        nova_sessions: [query({ data: { id: 'session-1' }, error: null })],
      })
    );

    const response = await getProblem();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(problem);
  });

  it('denies participants without an active session before reading full content', async () => {
    const detailQuery = query({ data: { description: 'secret' }, error: null });
    mocks.createAdminClient.mockResolvedValue(
      adminClient({
        nova_challenges: [query({ data: challenge(), error: null })],
        nova_problems: [
          query({ data: { challenge_id: 'challenge-1' }, error: null }),
          detailQuery,
        ],
        nova_sessions: [query({ data: null, error: null })],
      })
    );

    const response = await getProblem();
    expect(response.status).toBe(403);
    expect(detailQuery.select).not.toHaveBeenCalled();
  });

  it('allows an assigned manager for their challenge', async () => {
    mocks.getRole.mockResolvedValue(assignedManagerRole);
    mocks.createAdminClient.mockResolvedValue(
      adminClient({
        nova_challenge_manager_emails: [
          query({ data: [{ challenge_id: 'challenge-1' }], error: null }),
        ],
        nova_challenges: [query({ data: challenge(), error: null })],
        nova_problems: [
          query({ data: { challenge_id: 'challenge-1' }, error: null }),
          query({ data: { id: 'problem-1' }, error: null }),
        ],
      })
    );

    expect((await getProblem()).status).toBe(200);
  });

  it('denies assigned managers across challenge boundaries', async () => {
    mocks.getRole.mockResolvedValue(assignedManagerRole);
    const detailQuery = query({ data: { id: 'problem-2' }, error: null });
    mocks.createAdminClient.mockResolvedValue(
      adminClient({
        nova_challenge_manager_emails: [
          query({ data: [{ challenge_id: 'challenge-1' }], error: null }),
        ],
        nova_challenges: [
          query({ data: challenge({ id: 'challenge-2' }), error: null }),
        ],
        nova_problems: [
          query({ data: { challenge_id: 'challenge-2' }, error: null }),
          detailQuery,
        ],
      })
    );

    const response = await getProblem('problem-2');
    expect(response.status).toBe(403);
    expect(detailQuery.select).not.toHaveBeenCalled();
  });

  it('returns 404 without reading challenge data for an unknown problem', async () => {
    mocks.createAdminClient.mockResolvedValue(
      adminClient({ nova_problems: [query({ data: null, error: null })] })
    );
    expect((await getProblem('missing')).status).toBe(404);
  });
});
