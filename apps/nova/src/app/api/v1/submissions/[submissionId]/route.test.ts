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

const params = { params: Promise.resolve({ submissionId: 'submission-1' }) };

describe('Nova submission ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.getUser.mockReturnValue({ id: 'user-1' });
  });

  it('scopes reads, updates and deletes to the caller without reassigning owners', async () => {
    const { DELETE, GET, PUT } = await import('./route');
    const url = 'https://nova.test/api/v1/submissions/submission-1';

    await GET(new Request(url), params);
    await PUT(
      new Request(url, {
        body: JSON.stringify({ prompt: 'updated' }),
        method: 'PUT',
      }),
      params
    );
    await DELETE(new Request(url), params);

    expect(mocks.calls).toHaveLength(3);
    for (const call of mocks.calls) {
      expect(call.filters).toContainEqual(['user_id', 'user-1']);
    }
    expect(mocks.calls[1]).toMatchObject({
      operation: 'update',
      payload: { prompt: 'updated' },
    });
  });
});
