import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { count?: number | null; data: any; error: any };

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
    in: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
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

const globalManagerRole = {
  ...assignedManagerRole,
  allow_manage_all_challenges: true,
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

async function getProblems(queryString = '') {
  const { GET } = await import('./route');
  return GET(new Request(`https://nova.test/api/v1/problems${queryString}`));
}

describe('Nova problem catalog eligibility', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getUser.mockReturnValue({ email: 'user@example.com', id: 'user-1' });
    mocks.getRole.mockResolvedValue(participantRole);
  });

  it('rejects anonymous callers before creating an admin client', async () => {
    mocks.getUser.mockReturnValue(null);
    const response = await getProblems();
    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('makes challenge-less collection requests manager-only', async () => {
    mocks.createAdminClient.mockResolvedValue(adminClient({}));
    const response = await getProblems();
    expect(response.status).toBe(403);
  });

  it('returns bounded availability without downloading problem rows or requiring a session', async () => {
    const countQuery = query({ count: 1, data: null, error: null });
    mocks.createAdminClient.mockResolvedValue(
      adminClient({
        nova_challenges: [query({ data: challenge(), error: null })],
        nova_problems: [countQuery],
      })
    );

    const response = await getProblems(
      '?challengeId=challenge-1&availability=true'
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ hasProblems: true });
    expect(countQuery.select).toHaveBeenCalledWith('id', {
      count: 'exact',
      head: true,
    });
  });

  it('returns full problem content to an eligible participant with an active session', async () => {
    const problems = [{ id: 'problem-1', description: 'Problem content' }];
    mocks.createAdminClient.mockResolvedValue(
      adminClient({
        nova_challenges: [query({ data: challenge(), error: null })],
        nova_problems: [query({ data: problems, error: null })],
        nova_sessions: [query({ data: { id: 'session-1' }, error: null })],
      })
    );

    const response = await getProblems('?challengeId=challenge-1');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(problems);
  });

  it('denies full problem content without an active participant session', async () => {
    const client = adminClient({
      nova_challenges: [query({ data: challenge(), error: null })],
      nova_sessions: [query({ data: null, error: null })],
    });
    mocks.createAdminClient.mockResolvedValue(client);

    const response = await getProblems('?challengeId=challenge-1');
    expect(response.status).toBe(403);
    expect(client.from).not.toHaveBeenCalledWith('nova_problems');
  });

  it('denies disabled, pre-preview, and non-whitelisted participant catalogs', async () => {
    for (const restrictedChallenge of [
      challenge({ enabled: false }),
      challenge({ previewable_at: '2999-01-01T00:00:00.000Z' }),
      challenge({ whitelisted_only: true }),
    ]) {
      vi.resetModules();
      mocks.createAdminClient.mockResolvedValueOnce(
        adminClient({
          nova_challenges: [query({ data: restrictedChallenge, error: null })],
          ...(restrictedChallenge.whitelisted_only
            ? {
                nova_challenge_whitelisted_emails: [
                  query({ data: null, error: null }),
                ],
              }
            : {}),
        })
      );
      expect((await getProblems('?challengeId=challenge-1')).status).toBe(403);
    }
  });

  it('allows assigned managers only within their assigned challenge', async () => {
    mocks.getRole.mockResolvedValue(assignedManagerRole);
    const problems = [{ id: 'problem-1' }];
    mocks.createAdminClient.mockResolvedValueOnce(
      adminClient({
        nova_challenge_manager_emails: [
          query({ data: [{ challenge_id: 'challenge-1' }], error: null }),
        ],
        nova_challenges: [query({ data: challenge(), error: null })],
        nova_problems: [query({ data: problems, error: null })],
      })
    );
    expect((await getProblems('?challengeId=challenge-1')).status).toBe(200);

    vi.resetModules();
    mocks.createAdminClient.mockResolvedValueOnce(
      adminClient({
        nova_challenge_manager_emails: [
          query({ data: [{ challenge_id: 'challenge-1' }], error: null }),
        ],
        nova_challenges: [
          query({ data: challenge({ id: 'challenge-2' }), error: null }),
        ],
      })
    );
    expect((await getProblems('?challengeId=challenge-2')).status).toBe(403);
  });

  it('preserves challenge-less full catalogs for global managers', async () => {
    mocks.getRole.mockResolvedValue(globalManagerRole);
    const problems = [{ id: 'problem-1' }];
    mocks.createAdminClient.mockResolvedValue(
      adminClient({ nova_problems: [query({ data: problems, error: null })] })
    );

    const response = await getProblems();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(problems);
  });
});
