import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  enabled: false,
  from: vi.fn(),
  writes: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: state.from,
    schema: () => ({ from: state.from }),
  }),
}));
vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: () => ({
    id: 'actor',
    email: 'actor@example.test',
  }),
}));

import { DELETE, POST } from './route';

beforeEach(() => {
  state.enabled = false;
  state.writes.mockReset();
  state.from.mockReset().mockImplementation((table: string) => {
    let byActor = false;
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        if (
          key === 'user_id' ||
          (key === 'users.user_private_details.email' &&
            value === 'actor@example.test')
        )
          byActor = true;
        return query;
      },
      single: async () => ({
        data:
          table === 'platform_user_roles'
            ? byActor
              ? { enabled: state.enabled, allow_role_management: true }
              : { enabled: true, allow_challenge_management: true }
            : { id: 'challenge' },
        error: null,
      }),
      insert: () => {
        state.writes();
        return query;
      },
      delete: () => {
        state.writes();
        return query;
      },
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: null, error: null }),
    };
    return query;
  });
});
it.each(['POST', 'DELETE'])(
  'denies disabled managers for %s before mutations',
  async (method) => {
    const request = new NextRequest(
      'http://localhost/api/v1/challenges/challenge/managers?adminEmail=other@example.test',
      {
        method,
        ...(method === 'POST'
          ? { body: JSON.stringify({ adminEmail: 'other@example.test' }) }
          : {}),
      }
    );
    const response = await (method === 'POST' ? POST : DELETE)(request);
    expect(response.status).toBe(403);
    expect(state.writes).not.toHaveBeenCalled();
  }
);
it.each(['POST', 'DELETE'])(
  'preserves enabled global managers for %s',
  async (method) => {
    state.enabled = true;
    const response = await (method === 'POST' ? POST : DELETE)(
      new NextRequest(
        'http://localhost/api/v1/challenges/challenge/managers?adminEmail=other@example.test',
        {
          method,
          ...(method === 'POST'
            ? { body: JSON.stringify({ adminEmail: 'other@example.test' }) }
            : {}),
        }
      )
    );
    expect(response.status).toBe(method === 'POST' ? 201 : 200);
    expect(state.writes).toHaveBeenCalledOnce();
  }
);
