import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{
    filters: Array<[string, unknown]>;
    operation: string;
    payload?: unknown;
  }>,
  getUser: vi.fn(),
}));

vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: (...args: unknown[]) =>
    mocks.getUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const client = {
      from: () => {
        const call = {
          filters: [] as Array<[string, unknown]>,
          operation: 'select',
          payload: undefined as unknown,
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
          select: () => builder,
          single: async () => ({ data: { id: 'session-1' }, error: null }),
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
    const response = await put({
      endTime: '2026-10-24T01:00:00.000Z',
      status: 'ENDED',
    });

    expect(response.status).toBe(200);
    expect(mocks.calls).toEqual([
      {
        filters: [
          ['id', 'session-1'],
          ['user_id', 'user-1'],
        ],
        operation: 'update',
        payload: { end_time: '2026-10-24T01:00:00.000Z', status: 'ENDED' },
      },
    ]);
  });

  it('scopes reads and deletes to the caller', async () => {
    const { DELETE, GET } = await import('./route');
    const request = new Request('https://nova.test/api/v1/sessions/session-1');

    await GET(request, params);
    await DELETE(request, params);

    for (const call of mocks.calls) {
      expect(call.filters).toContainEqual(['user_id', 'user-1']);
    }
    expect(mocks.calls).toHaveLength(2);
  });
});
