import { createMeetGuestSession } from '@tuturuuu/utils/meet-guest-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PLAN_ID = '0b6f8a52-3c1e-4f7a-9d2b-5e8c7a6b4d3f';
const GUEST_ID = 'guest-1';

interface PlanFixture {
  creator_id: string;
  id: string;
  is_public: boolean;
  ws_id: string | null;
}

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn(),
  getPlan: vi.fn(),
  inserts: [] as unknown[],
  resolveAuthenticatedSessionUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (...args: unknown[]) =>
    mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/plan-helpers', () => ({ getPlan: mocks.getPlan }));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));

// Mirrors the anonymous branch of the real `getPlan`: only public,
// non-workspace plans are visible without an actor.
function anonymousPlanAccess(plan: PlanFixture) {
  return async (_planId: string, options: { actorUserId?: string | null }) =>
    options.actorUserId === null && plan.is_public && !plan.ws_id ? plan : null;
}

function builder() {
  const query: Record<string, unknown> = {};
  for (const method of ['delete', 'eq', 'select']) {
    query[method] = vi.fn(() => query);
  }
  query.insert = vi.fn((value: unknown) => {
    mocks.inserts.push(value);
    return query;
  });
  query.single = vi.fn(async () => ({
    data: { is_confirmed: false },
    error: null,
  }));
  query.maybeSingle = vi.fn(async () => ({
    data: { id: GUEST_ID, plan_id: PLAN_ID },
    error: null,
  }));
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: [{ id: 'tb-1' }], error: null }).then(resolve);
  return query;
}

const timeblock = {
  date: '2026-08-04',
  start_time: '09:00:00+07',
  end_time: '09:15:00+07',
  tentative: false,
};

const guestInput = () => ({
  guest_session: createMeetGuestSession({ guestId: GUEST_ID, planId: PLAN_ID })
    .token,
  user_id: GUEST_ID,
});

const deniedPlans: Array<[string, PlanFixture]> = [
  [
    'a private personal plan',
    { creator_id: 'u1', id: PLAN_ID, is_public: false, ws_id: null },
  ],
  [
    'a public workspace plan',
    { creator_id: 'u1', id: PLAN_ID, is_public: true, ws_id: 'ws-1' },
  ],
  [
    'a private workspace plan',
    { creator_id: 'u1', id: PLAN_ID, is_public: false, ws_id: 'ws-1' },
  ],
];

describe('Meet guest availability plan access', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.inserts.length = 0;
    mocks.from.mockImplementation(() => builder());
    mocks.createAdminClient.mockResolvedValue({ from: mocks.from });
    mocks.createClient.mockResolvedValue({ from: mocks.from });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: 'platform-user-1' },
    });
  });

  describe.each(deniedPlans)('on %s', (_label, plan) => {
    beforeEach(() => {
      mocks.getPlan.mockImplementation(anonymousPlanAccess(plan));
    });

    it('denies guest createTimeblocks before any database call', async () => {
      const { createTimeblocks } = await import('./timeblocks.js');

      expect(
        await createTimeblocks(PLAN_ID, {
          ...guestInput(),
          timeblocks: [timeblock],
        })
      ).toEqual({ error: 'Unauthorized' });
      expect(mocks.getPlan).toHaveBeenCalledWith(PLAN_ID, {
        actorUserId: null,
      });
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });

    it('denies guest deleteTimeblock before any database call', async () => {
      const { deleteTimeblock } = await import('./timeblocks.js');

      expect(await deleteTimeblock(PLAN_ID, 'tb-1', guestInput())).toEqual({
        error: 'Unauthorized',
      });
      expect(mocks.getPlan).toHaveBeenCalledWith(PLAN_ID, {
        actorUserId: null,
      });
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe('on a public non-workspace plan', () => {
    beforeEach(() => {
      mocks.getPlan.mockImplementation(
        anonymousPlanAccess({
          creator_id: 'u1',
          id: PLAN_ID,
          is_public: true,
          ws_id: null,
        })
      );
    });

    it('still lets a guest create availability', async () => {
      const { createTimeblocks } = await import('./timeblocks.js');

      expect(
        await createTimeblocks(PLAN_ID, {
          ...guestInput(),
          timeblocks: [timeblock],
        })
      ).toEqual({ data: { ids: ['tb-1'] } });
      expect(mocks.inserts).toEqual([
        [expect.objectContaining({ plan_id: PLAN_ID, user_id: GUEST_ID })],
      ]);
    });

    it('still lets a guest delete availability', async () => {
      const { deleteTimeblock } = await import('./timeblocks.js');

      expect(await deleteTimeblock(PLAN_ID, 'tb-1', guestInput())).toEqual({
        data: { success: true },
      });
    });
  });

  it('leaves the signed-in branches on the existing plan policy', async () => {
    mocks.getPlan.mockResolvedValue(null);
    const { createTimeblocks, deleteTimeblock } = await import(
      './timeblocks.js'
    );

    await createTimeblocks(PLAN_ID, { timeblocks: [timeblock] });
    await deleteTimeblock(PLAN_ID, 'tb-1');

    expect(mocks.getPlan).not.toHaveBeenCalled();
  });
});
