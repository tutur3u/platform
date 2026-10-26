import { beforeEach, describe, expect, it, vi } from 'vitest';

const CHALLENGE_ID = 'challenge-1';
const CRITERION_ID = 'criterion-1';

const mocks = vi.hoisted(() => ({
  challenge: null as Record<string, unknown> | null,
  criterion: null as Record<string, unknown> | null,
  getRole: vi.fn(),
  getUser: vi.fn(),
  managerChallengeIds: [] as string[],
  operations: [] as Array<{
    filters: Array<[string, unknown]>;
    operation: string;
    table: string;
  }>,
}));

vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: (...args: unknown[]) =>
    mocks.getUser(...args),
  getNovaPlatformRole: (...args: unknown[]) => mocks.getRole(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const client = {
      from: (table: string) => {
        const query = {
          filters: [] as Array<[string, unknown]>,
          operation: 'select',
          table,
        };
        mocks.operations.push(query);

        const builder = {
          delete: () => {
            query.operation = 'delete';
            return builder;
          },
          eq: (column: string, value: unknown) => {
            query.filters.push([column, value]);
            return builder;
          },
          insert: () => {
            query.operation = 'insert';
            return builder;
          },
          maybeSingle: async () => ({
            data:
              table === 'nova_challenges'
                ? mocks.challenge
                : table === 'nova_challenge_criteria'
                  ? mocks.criterion
                  : null,
            error: null,
          }),
          select: () => builder,
          single: async () => ({ data: mocks.criterion, error: null }),
          update: () => {
            query.operation = 'update';
            return builder;
          },
          // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({
              data:
                table === 'nova_challenge_criteria'
                  ? [mocks.criterion]
                  : table === 'nova_challenge_manager_emails'
                    ? mocks.managerChallengeIds.map((challenge_id) => ({
                        challenge_id,
                      }))
                    : [],
              error: null,
            }).then(resolve),
        };

        return builder;
      },
      schema: () => client,
    };

    return client;
  },
}));

const participantRole = {
  allow_challenge_management: false,
  allow_manage_all_challenges: false,
  allow_role_management: false,
  enabled: true,
};

function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string
) {
  return new Request(`https://nova.test${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: cookie ? { cookie } : {},
    method,
  });
}

const params = { params: Promise.resolve({ criterionId: CRITERION_ID }) };

describe('Nova criteria access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.operations.length = 0;
    mocks.managerChallengeIds = [];
    mocks.challenge = {
      enabled: true,
      id: CHALLENGE_ID,
      password_hash: null,
      previewable_at: '2020-01-01T00:00:00.000Z',
      whitelisted_only: false,
    };
    mocks.criterion = {
      challenge_id: CHALLENGE_ID,
      description: 'Private criterion',
      id: CRITERION_ID,
      name: 'Criterion',
    };
    mocks.getUser.mockReturnValue({ email: 'user@example.com', id: 'user-1' });
    mocks.getRole.mockResolvedValue(participantRole);
  });

  it('requires a challenge scope for collection reads', async () => {
    const { GET } = await import('./route');
    const response = await GET(request('/api/v1/criteria'));

    expect(response.status).toBe(400);
    expect(mocks.operations.map(({ table }) => table)).not.toContain(
      'nova_challenge_criteria'
    );
  });

  it('rejects collection reads outside the participant catalog', async () => {
    const { GET } = await import('./route');
    mocks.challenge = { ...mocks.challenge, enabled: false };

    const response = await GET(
      request(`/api/v1/criteria?challengeId=${CHALLENGE_ID}`)
    );

    expect(response.status).toBe(403);
    expect(mocks.operations.map(({ table }) => table)).not.toContain(
      'nova_challenge_criteria'
    );
  });

  it('requires the challenge password grant for collection and detail reads', async () => {
    mocks.challenge = { ...mocks.challenge, password_hash: 'scrypt$stored' };
    const collection = await import('./route').then(({ GET }) =>
      GET(request(`/api/v1/criteria?challengeId=${CHALLENGE_ID}`))
    );
    const detail = await import('./[criterionId]/route').then(({ GET }) =>
      GET(request(`/api/v1/criteria/${CRITERION_ID}`), params)
    );

    expect(collection.status).toBe(403);
    expect(detail.status).toBe(403);
  });

  it('allows eligible participants and scopes every collection read to the challenge', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      request(`/api/v1/criteria?challengeId=${CHALLENGE_ID}`)
    );

    expect(response.status).toBe(200);
    expect(mocks.operations.at(-1)).toMatchObject({
      filters: [['challenge_id', CHALLENGE_ID]],
      table: 'nova_challenge_criteria',
    });
  });

  it('allows an assigned manager to read a protected challenge', async () => {
    mocks.challenge = { ...mocks.challenge, password_hash: 'scrypt$stored' };
    mocks.managerChallengeIds = [CHALLENGE_ID];
    mocks.getRole.mockResolvedValue({
      ...participantRole,
      allow_challenge_management: true,
    });

    const { GET } = await import('./route');
    const response = await GET(
      request(`/api/v1/criteria?challengeId=${CHALLENGE_ID}`)
    );

    expect(response.status).toBe(200);
    expect(mocks.operations.at(-1)).toMatchObject({
      filters: [['challenge_id', CHALLENGE_ID]],
      table: 'nova_challenge_criteria',
    });
  });

  it('scopes criterion detail to an eligible parent challenge', async () => {
    const { GET } = await import('./[criterionId]/route');
    const response = await GET(
      request(`/api/v1/criteria/${CRITERION_ID}`),
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.operations.at(-1)).toMatchObject({
      filters: [
        ['id', CRITERION_ID],
        ['challenge_id', CHALLENGE_ID],
      ],
      table: 'nova_challenge_criteria',
    });
  });

  it('rejects writes to a challenge the caller cannot manage', async () => {
    const collection = await import('./route').then(({ POST }) =>
      POST(
        request('/api/v1/criteria', 'POST', {
          challengeId: 'other-challenge',
          description: 'x',
          name: 'x',
        })
      )
    );
    const update = await import('./[criterionId]/route').then(({ PUT }) =>
      PUT(
        request(`/api/v1/criteria/${CRITERION_ID}`, 'PUT', { name: 'changed' }),
        params
      )
    );
    const remove = await import('./[criterionId]/route').then(({ DELETE }) =>
      DELETE(request(`/api/v1/criteria/${CRITERION_ID}`, 'DELETE'), params)
    );

    expect(collection.status).toBe(403);
    expect(update.status).toBe(403);
    expect(remove.status).toBe(403);
    expect(
      mocks.operations.some(({ operation }) =>
        ['insert', 'update', 'delete'].includes(operation)
      )
    ).toBe(false);
  });
});
