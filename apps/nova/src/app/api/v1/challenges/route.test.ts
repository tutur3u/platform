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

const globalManagerRole = {
  ...participantRole,
  allow_challenge_management: true,
  allow_manage_all_challenges: true,
};

const assignedManagerRole = {
  ...participantRole,
  allow_challenge_management: true,
};

function challenge(overrides: Record<string, unknown> = {}) {
  return {
    close_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    description: 'Private problem set',
    duration: 3600,
    enabled: true,
    id: 'challenge-1',
    max_attempts: 2,
    max_daily_attempts: 1,
    open_at: null,
    password_hash: 'stored-verifier',
    password_salt: 'stored-salt',
    previewable_at: '2020-01-01T00:00:00.000Z',
    title: 'Challenge One',
    whitelisted_only: false,
    ...overrides,
  };
}

async function getChallenges() {
  const { GET } = await import('./route');
  return GET(new Request('https://nova.test/api/v1/challenges'));
}

describe('Nova challenge catalog eligibility', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getUser.mockReturnValue({ email: 'user@example.com', id: 'user-1' });
    mocks.getRole.mockResolvedValue(participantRole);
  });

  it('rejects anonymous callers before creating an admin client', async () => {
    mocks.getUser.mockReturnValue(null);
    const response = await getChallenges();
    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns only the participant-safe projection for eligible challenges', async () => {
    mocks.createAdminClient.mockResolvedValue(
      adminClient({
        nova_challenges: [query({ data: [challenge()], error: null })],
      })
    );

    const response = await getChallenges();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        close_at: null,
        description: 'Private problem set',
        duration: 3600,
        id: 'challenge-1',
        max_attempts: 2,
        max_daily_attempts: 1,
        open_at: null,
        password_protected: true,
        previewable_at: '2020-01-01T00:00:00.000Z',
        title: 'Challenge One',
      },
    ]);
  });

  it.each([
    ['disabled', { enabled: false }],
    ['before preview time', { previewable_at: '2999-01-01T00:00:00.000Z' }],
  ])(
    'hides %s challenges from ordinary participants',
    async (_name, overrides) => {
      mocks.createAdminClient.mockResolvedValue(
        adminClient({
          nova_challenges: [
            query({ data: [challenge(overrides)], error: null }),
          ],
        })
      );

      const response = await getChallenges();
      await expect(response.json()).resolves.toEqual([]);
    }
  );

  it('shows whitelist-only challenges only to whitelisted participants', async () => {
    const challengeQuery = query({
      data: [challenge({ whitelisted_only: true })],
      error: null,
    });
    const deniedClient = adminClient({
      nova_challenges: [challengeQuery],
      nova_challenge_whitelisted_emails: [query({ data: [], error: null })],
    });
    mocks.createAdminClient.mockResolvedValueOnce(deniedClient);
    await expect((await getChallenges()).json()).resolves.toEqual([]);

    vi.resetModules();
    const allowedClient = adminClient({
      nova_challenges: [
        query({ data: [challenge({ whitelisted_only: true })], error: null }),
      ],
      nova_challenge_whitelisted_emails: [
        query({ data: [{ challenge_id: 'challenge-1' }], error: null }),
      ],
    });
    mocks.createAdminClient.mockResolvedValueOnce(allowedClient);
    await expect((await getChallenges()).json()).resolves.toHaveLength(1);
  });

  it('limits assigned managers to their assigned challenge catalog', async () => {
    mocks.getRole.mockResolvedValue(assignedManagerRole);
    const challengesQuery = query({ data: [challenge()], error: null });
    mocks.createAdminClient.mockResolvedValue(
      adminClient({
        nova_challenge_manager_emails: [
          query({ data: [{ challenge_id: 'challenge-1' }], error: null }),
        ],
        nova_challenges: [challengesQuery],
      })
    );

    const response = await getChallenges();
    expect(response.status).toBe(200);
    expect(challengesQuery.in).toHaveBeenCalledWith('id', ['challenge-1']);
  });

  it('preserves the full redacted management catalog for global managers', async () => {
    mocks.getRole.mockResolvedValue(globalManagerRole);
    mocks.createAdminClient.mockResolvedValue(
      adminClient({
        nova_challenges: [query({ data: [challenge()], error: null })],
      })
    );

    const response = await getChallenges();
    const body = await response.json();
    expect(body[0]).toMatchObject({
      created_at: '2026-01-01T00:00:00.000Z',
      password_hash: '',
      password_salt: '',
      whitelisted_only: false,
    });
  });
});
