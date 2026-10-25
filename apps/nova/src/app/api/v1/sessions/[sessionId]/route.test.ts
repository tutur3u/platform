import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{
    filters: Array<[string, unknown]>;
    operation: string;
    payload?: unknown;
  }>,
  challenge: { close_at: null, duration: 3600 } as Record<string, unknown>,
  getUser: vi.fn(),
  session: {
    challenge_id: 'challenge-1',
    start_time: new Date(Date.now() - 60_000).toISOString(),
    status: 'ENDED',
  } as Record<string, unknown>,
}));

vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: (...args: unknown[]) =>
    mocks.getUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const client = {
      from: (table: string) => {
        const call = {
          filters: [] as Array<[string, unknown]>,
          operation: 'select',
          payload: undefined as unknown,
          table,
        };
        mocks.calls.push(call);
        const builder = {
          delete: () => {
            call.operation = 'delete';
            return builder;
          },
          eq: (column: string, value: unknown) => {
            call.filters.push([column, value]);
            return builder;
          },
          limit: () => builder,
          select: () => builder,
          maybeSingle: async () => ({
            data: table === 'nova_challenges' ? mocks.challenge : mocks.session,
            error: null,
          }),
          single: async () => ({
            data: { id: 'session-1', ...mocks.session },
            error: null,
          }),
          // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(resolve),
          update: (value: unknown) => {
            call.operation = 'update';
            call.payload = value;
            return builder;
          },
        };
        return builder;
      },
      schema: () => client,
    };
    return client;
  },
}));

const params = { params: Promise.resolve({ sessionId: 'session-1' }) };

function put(body: unknown) {
  return import('./route').then(({ PUT }) =>
    PUT(
      new Request('https://nova.test/api/v1/sessions/session-1', {
        body: JSON.stringify(body),
        method: 'PUT',
      }),
      params
    )
  );
}

describe('Nova session ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.challenge = { close_at: null, duration: 3600 };
    mocks.session = {
      challenge_id: 'challenge-1',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      status: 'ENDED',
    };
    mocks.getUser.mockReturnValue({ id: 'user-1' });
  });

  it('refuses to move, restart or reopen a session', async () => {
    for (const body of [
      { challengeId: 'protected-challenge' },
      { startTime: '2026-10-24T00:00:00.000Z' },
      { status: 'IN_PROGRESS' },
    ]) {
      expect((await put(body)).status).toBe(400);
    }
    expect(mocks.calls).toEqual([]);
  });

  it('ends only the caller-owned session', async () => {
    mocks.session = { ...mocks.session, status: 'IN_PROGRESS' };
    const response = await put({
      endTime: '2026-10-24T01:00:00.000Z',
      status: 'ENDED',
    });

    expect(response.status).toBe(200);
    expect(mocks.calls.at(-1)).toMatchObject({
      filters: [
        ['id', 'session-1'],
        ['user_id', 'user-1'],
        ['status', 'IN_PROGRESS'],
      ],
      operation: 'update',
      payload: { status: 'ENDED' },
    });
    const updatedPayload = mocks.calls.at(-1)?.payload;
    expect(updatedPayload).toBeDefined();
    if (!updatedPayload) throw new Error('Expected a session update payload');
    expect(
      new Date(
        String((updatedPayload as Record<string, unknown>).end_time)
      ).getTime()
    ).toBeLessThanOrEqual(Date.now());
  });

  it('scopes reads and deletes to the caller', async () => {
    const { DELETE, GET } = await import('./route');
    const request = new Request('https://nova.test/api/v1/sessions/session-1');

    await GET(request, params);
    const deleted = await DELETE(request);

    expect(mocks.calls.at(-1)?.filters).toContainEqual(['user_id', 'user-1']);
    expect(deleted.status).toBe(403);
    expect(mocks.calls).toHaveLength(1);
  });

  it('does not return an in-progress session after its duration expires', async () => {
    mocks.challenge = { close_at: null, duration: 60 };
    mocks.session = {
      challenge_id: 'challenge-1',
      start_time: new Date(Date.now() - 120_000).toISOString(),
      status: 'IN_PROGRESS',
    };

    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://nova.test/api/v1/sessions/session-1'),
      params
    );

    expect(response.status).toBe(410);
  });

  it('does not return an in-progress session after the challenge closes', async () => {
    mocks.challenge = {
      close_at: new Date(Date.now() - 60_000).toISOString(),
      duration: 3600,
    };
    mocks.session = {
      challenge_id: 'challenge-1',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      status: 'IN_PROGRESS',
    };

    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://nova.test/api/v1/sessions/session-1'),
      params
    );

    expect(response.status).toBe(410);
  });
});
