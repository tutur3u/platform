import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  from: vi.fn(),
  votes: [
    { option_id: 'own-option', guest_id: 'guest' },
    { option_id: 'foreign-option', guest_id: 'guest' },
  ],
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: async () => ({ from: state.from }),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({ user: { id: 'creator' } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { removeUserFromPlan } from './users';

beforeEach(() => {
  state.votes = [
    { option_id: 'own-option', guest_id: 'guest' },
    { option_id: 'foreign-option', guest_id: 'guest' },
  ];
  state.from.mockReset().mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    let deleting = false;
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        return query;
      },
      in: (key: string, value: unknown) => {
        filters[key] = value;
        return query;
      },
      delete: () => {
        deleting = true;
        return query;
      },
      single: async () => ({ data: { creator_id: 'creator' }, error: null }),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
      then: (resolve: (value: unknown) => void) => {
        if (table === 'poll_guest_votes' && deleting)
          state.votes = state.votes.filter(
            (vote) =>
              vote.guest_id !== filters.guest_id ||
              (Array.isArray(filters.option_id) &&
                !filters.option_id.includes(vote.option_id))
          );
        resolve({
          data:
            table === 'polls'
              ? filters.plan_id === 'plan'
                ? [{ id: 'own-poll' }]
                : []
              : table === 'poll_options'
                ? Array.isArray(filters.poll_id) &&
                  filters.poll_id.includes('own-poll')
                  ? [{ id: 'own-option' }]
                  : []
                : null,
          error: null,
        });
      },
    };
    return query;
  });
});
it('removes guest votes only from polls belonging to the selected plan', async () => {
  const result = await removeUserFromPlan('plan', 'guest');
  expect(result.error).toBeUndefined();
  expect(state.votes).toEqual([
    { option_id: 'foreign-option', guest_id: 'guest' },
  ]);
});
