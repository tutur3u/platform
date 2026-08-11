import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  type Operation = 'delete' | 'insert' | 'select' | 'update';
  type Terminal = 'maybeSingle' | 'query' | 'single';

  const responses = new Map<string, unknown[]>();
  const mutations: Array<{
    filters: Array<{ column: string; value: unknown }>;
    operation: Operation;
    payload?: unknown;
    table: string;
  }> = [];

  const responseKey = (
    table: string,
    operation: Operation,
    terminal: Terminal
  ) => `${table}:${operation}:${terminal}`;

  const nextResponse = (
    table: string,
    operation: Operation,
    terminal: Terminal
  ) => {
    const queue = responses.get(responseKey(table, operation, terminal));
    return (
      queue?.shift() ?? { data: terminal === 'query' ? [] : null, error: null }
    );
  };

  const from = vi.fn((table: string) => {
    let operation: Operation = 'select';
    let payload: unknown;
    const filters: Array<{ column: string; value: unknown }> = [];
    const recordMutation = () => {
      mutations.push({ filters, operation, payload, table });
    };

    const builder: Record<string, unknown> & PromiseLike<unknown> = {
      delete: vi.fn(() => {
        operation = 'delete';
        recordMutation();
        return builder;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value });
        return builder;
      }),
      in: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value });
        return builder;
      }),
      insert: vi.fn((value: unknown) => {
        operation = 'insert';
        payload = value;
        recordMutation();
        return builder;
      }),
      match: vi.fn((value: Record<string, unknown>) => {
        for (const [column, filterValue] of Object.entries(value)) {
          filters.push({ column, value: filterValue });
        }
        return builder;
      }),
      maybeSingle: vi.fn(() =>
        Promise.resolve(nextResponse(table, operation, 'maybeSingle'))
      ),
      select: vi.fn(() => builder),
      single: vi.fn(() =>
        Promise.resolve(nextResponse(table, operation, 'single'))
      ),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
      then: (onFulfilled, onRejected) =>
        Promise.resolve(nextResponse(table, operation, 'query')).then(
          onFulfilled,
          onRejected
        ),
      update: vi.fn((value: unknown) => {
        operation = 'update';
        payload = value;
        recordMutation();
        return builder;
      }),
    };

    return builder;
  });

  return {
    createAdminClient: vi.fn(),
    createClient: vi.fn(),
    from,
    mutations,
    queue(
      table: string,
      operation: Operation,
      terminal: Terminal,
      response: unknown
    ) {
      const key = responseKey(table, operation, terminal);
      responses.set(key, [...(responses.get(key) ?? []), response]);
    },
    resetDatabase() {
      responses.clear();
      mutations.length = 0;
      from.mockClear();
    },
    resolveAuthenticatedSessionUser: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (...args: unknown[]) =>
    mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));

describe('Meet poll mutation authorization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resetDatabase();
    mocks.createAdminClient.mockResolvedValue({ from: mocks.from });
    mocks.createClient.mockResolvedValue({ session: true });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: 'platform-user-1' },
    });
  });

  it('rejects an impersonated guest before any admin mutation', async () => {
    mocks.queue('meet_together_guests', 'select', 'maybeSingle', {
      data: null,
      error: null,
    });
    const { addPollOption } = await import('./polls.js');

    const result = await addPollOption('plan-1', {
      guestId: 'guest-1',
      guestPasswordHash: 'wrong-credential',
      pollId: 'poll-1',
      userType: 'GUEST',
      value: 'Cafe',
    });

    expect(result).toEqual({ error: 'Unauthorized' });
    expect(mocks.mutations).toEqual([]);
  });

  it('rejects a cross-plan poll before replacing platform votes', async () => {
    mocks.queue('polls', 'select', 'maybeSingle', {
      data: null,
      error: null,
    });
    const { submitVote } = await import('./polls.js');

    const result = await submitVote('plan-1', {
      optionIds: ['option-1'],
      pollId: 'poll-from-another-plan',
      userType: 'PLATFORM',
    });

    expect(result).toEqual({ error: 'Poll not found' });
    expect(mocks.mutations).toEqual([]);
  });

  it('rejects a non-owner creating a poll before insert', async () => {
    mocks.queue('meet_together_plans', 'select', 'maybeSingle', {
      data: { creator_id: 'plan-owner', is_confirmed: false },
      error: null,
    });
    const { createPoll } = await import('./polls.js');

    const result = await createPoll('plan-1', { name: 'Lunch' });

    expect(result).toEqual({
      error: 'You are not the creator of this plan',
    });
    expect(mocks.mutations).toEqual([]);
  });

  it('allows a valid owner to create a plan-bound poll', async () => {
    mocks.queue('meet_together_plans', 'select', 'maybeSingle', {
      data: { creator_id: 'platform-user-1', is_confirmed: false },
      error: null,
    });
    mocks.queue('polls', 'insert', 'single', {
      data: {
        allow_anonymous_updates: false,
        creator_id: 'platform-user-1',
        id: 'poll-1',
        name: 'Lunch',
        plan_id: 'plan-1',
      },
      error: null,
    });
    const { createPoll } = await import('./polls.js');

    const result = await createPoll('plan-1', { name: 'Lunch' });

    expect(result.data?.poll.id).toBe('poll-1');
    expect(mocks.mutations).toContainEqual(
      expect.objectContaining({
        operation: 'insert',
        payload: expect.objectContaining({
          creator_id: 'platform-user-1',
          plan_id: 'plan-1',
        }),
        table: 'polls',
      })
    );
  });

  it('allows a valid owner to toggle the plan where poll control', async () => {
    mocks.queue('meet_together_plans', 'select', 'maybeSingle', {
      data: { creator_id: 'platform-user-1', is_confirmed: false },
      error: null,
    });
    mocks.queue('meet_together_plans', 'update', 'single', {
      data: { id: 'plan-1', where_to_meet: false },
      error: null,
    });
    const { toggleWherePoll } = await import('./polls.js');

    const result = await toggleWherePoll('plan-1', false);

    expect(result.data).toEqual({
      id: 'plan-1',
      pollId: null,
      where_to_meet: false,
    });
    expect(mocks.mutations).toContainEqual(
      expect.objectContaining({
        operation: 'update',
        payload: { where_to_meet: false },
        table: 'meet_together_plans',
      })
    );
  });

  it('allows a valid platform participant to replace their votes', async () => {
    mocks.queue('polls', 'select', 'maybeSingle', {
      data: {
        creator_id: 'plan-owner',
        id: 'poll-1',
        name: 'Lunch',
        plan_id: 'plan-1',
      },
      error: null,
    });
    mocks.queue('meet_together_plans', 'select', 'maybeSingle', {
      data: { is_confirmed: false },
      error: null,
    });
    mocks.queue('poll_options', 'select', 'query', {
      data: [{ id: 'option-1' }, { id: 'option-2' }],
      error: null,
    });
    mocks.queue('poll_user_votes', 'delete', 'query', {
      data: null,
      error: null,
    });
    mocks.queue('poll_user_votes', 'insert', 'query', {
      data: null,
      error: null,
    });
    const { submitVote } = await import('./polls.js');

    const result = await submitVote('plan-1', {
      optionIds: ['option-2'],
      pollId: 'poll-1',
      userType: 'PLATFORM',
    });

    expect(result).toEqual({ data: { success: true } });
    expect(mocks.mutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'delete',
          table: 'poll_user_votes',
        }),
        expect.objectContaining({
          operation: 'insert',
          payload: [{ option_id: 'option-2', user_id: 'platform-user-1' }],
          table: 'poll_user_votes',
        }),
      ])
    );
  });

  it('allows a valid plan-bound guest to add and vote for an option', async () => {
    mocks.queue('meet_together_guests', 'select', 'maybeSingle', {
      data: { id: 'guest-1' },
      error: null,
    });
    mocks.queue('polls', 'select', 'maybeSingle', {
      data: {
        creator_id: 'plan-owner',
        id: 'poll-1',
        name: 'Lunch',
        plan_id: 'plan-1',
      },
      error: null,
    });
    mocks.queue('meet_together_plans', 'select', 'maybeSingle', {
      data: { is_confirmed: false },
      error: null,
    });
    mocks.queue('poll_options', 'insert', 'single', {
      data: {
        created_at: '2026-08-10T00:00:00.000Z',
        id: 'option-1',
        poll_id: 'poll-1',
        value: 'Cafe',
      },
      error: null,
    });
    mocks.queue('poll_guest_votes', 'insert', 'query', {
      data: null,
      error: null,
    });
    mocks.queue('poll_user_votes', 'select', 'query', {
      data: [],
      error: null,
    });
    mocks.queue('poll_guest_votes', 'select', 'query', {
      data: [],
      error: null,
    });
    const { addPollOption } = await import('./polls.js');

    const result = await addPollOption('plan-1', {
      guestId: 'guest-1',
      guestPasswordHash: 'valid-credential',
      pollId: 'poll-1',
      userType: 'GUEST',
      value: 'Cafe',
    });

    expect(result.data?.option.id).toBe('option-1');
    expect(mocks.mutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'insert',
          payload: { poll_id: 'poll-1', value: 'Cafe' },
          table: 'poll_options',
        }),
        expect.objectContaining({
          operation: 'insert',
          payload: { guest_id: 'guest-1', option_id: 'option-1' },
          table: 'poll_guest_votes',
        }),
      ])
    );
  });

  it('rejects a non-creator deleting a poll before delete', async () => {
    mocks.queue('polls', 'select', 'maybeSingle', {
      data: {
        creator_id: 'another-user',
        id: 'poll-1',
        name: 'Lunch',
        plan_id: 'plan-1',
      },
      error: null,
    });
    mocks.queue('meet_together_plans', 'select', 'maybeSingle', {
      data: { is_confirmed: false },
      error: null,
    });
    const { deletePoll } = await import('./polls.js');

    const result = await deletePoll('plan-1', 'poll-1');

    expect(result).toEqual({
      error: 'Only the poll creator can delete this poll',
    });
    expect(mocks.mutations).toEqual([]);
  });
});
