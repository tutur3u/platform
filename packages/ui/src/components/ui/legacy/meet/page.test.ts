import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMeetTogetherPlansData } from './page';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('en'),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

type QueryCall = {
  column?: string;
  table: string;
  type: 'select' | 'eq' | 'neq' | 'order' | 'in';
  value?: unknown;
};

function createBuilder(table: string, data: unknown[], calls: QueryCall[]) {
  const builder = Object.assign(Promise.resolve({ data, error: null }), {
    eq: vi.fn((column: string, value: unknown) => {
      calls.push({ column, table, type: 'eq', value });
      return builder;
    }),
    in: vi.fn((column: string, value: unknown) => {
      calls.push({ column, table, type: 'in', value });
      return builder;
    }),
    neq: vi.fn((column: string, value: unknown) => {
      calls.push({ column, table, type: 'neq', value });
      return builder;
    }),
    order: vi.fn((column: string, value: unknown) => {
      calls.push({ column, table, type: 'order', value });
      return builder;
    }),
    select: vi.fn((column: string) => {
      calls.push({ column, table, type: 'select' });
      return builder;
    }),
  });

  return builder;
}

describe('MeetTogether plans data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
        }),
      },
    });
  });

  it('consolidates personal workspace plans with previously interacted plans', async () => {
    const calls: QueryCall[] = [];
    const personalPlan = {
      created_at: '2026-01-01T00:00:00.000Z',
      creator_id: 'user-1',
      id: 'personal-created',
      ws_id: 'personal-ws',
    };
    const interactedPlan = {
      created_at: '2026-01-03T00:00:00.000Z',
      creator_id: 'other-user',
      id: 'team-interacted',
      ws_id: 'team-ws',
    };
    const participant = {
      display_name: 'User',
      is_guest: false,
      plan_id: 'team-interacted',
      timeblock_count: 1,
      user_id: 'user-1',
    };
    const builders = [
      createBuilder('meet_together_plans', [personalPlan], calls),
      createBuilder(
        'meet_together_user_timeblocks',
        [interactedPlan, personalPlan],
        calls
      ),
      createBuilder('meet_together_users', [participant], calls),
    ];

    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => builders.shift()),
    });

    const result = await getMeetTogetherPlansData({
      scope: 'personal-consolidated',
      wsId: 'personal-ws',
    });

    expect(result.data.map((plan) => plan.id)).toEqual([
      'team-interacted',
      'personal-created',
    ]);
    expect(result.totalCount).toBe(2);
    expect(result.data[0]?.participants).toEqual([participant]);
    expect(calls).toEqual(
      expect.arrayContaining([
        {
          column: 'ws_id',
          table: 'meet_together_plans',
          type: 'eq',
          value: 'personal-ws',
        },
        {
          column: 'user_id',
          table: 'meet_together_user_timeblocks',
          type: 'eq',
          value: 'user-1',
        },
      ])
    );
    expect(calls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column: 'meet_together_plans.ws_id',
          table: 'meet_together_user_timeblocks',
          type: 'eq',
        }),
      ])
    );
  });

  it('keeps team workspace plans scoped to the active workspace', async () => {
    const calls: QueryCall[] = [];
    const builders = [
      createBuilder('meet_together_plans', [], calls),
      createBuilder('meet_together_user_timeblocks', [], calls),
      createBuilder('meet_together_users', [], calls),
    ];

    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => builders.shift()),
    });

    await getMeetTogetherPlansData({
      scope: 'workspace',
      wsId: 'team-ws',
    });

    expect(calls).toEqual(
      expect.arrayContaining([
        {
          column: 'ws_id',
          table: 'meet_together_plans',
          type: 'eq',
          value: 'team-ws',
        },
        {
          column: 'meet_together_plans.ws_id',
          table: 'meet_together_user_timeblocks',
          type: 'eq',
          value: 'team-ws',
        },
        {
          column: 'meet_together_plans.creator_id',
          table: 'meet_together_user_timeblocks',
          type: 'neq',
          value: 'user-1',
        },
      ])
    );
  });
});
