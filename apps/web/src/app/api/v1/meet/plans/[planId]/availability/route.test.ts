import { createMeetGuestSession } from '@tuturuuu/utils/meet-guest-session';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PLAN_ID = '0b6f8a52-3c1e-4f7a-9d2b-5e8c7a6b4d3f';
const GUEST_ID = '6a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const STORED_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const mocks = vi.hoisted(() => ({
  callPrivateMeetRpc: vi.fn(),
  guestLookup: vi.fn(),
  guestFilters: [] as Array<[string, unknown]>,
  loadMeetPlanSnapshot: vi.fn(),
  resolveOptionalMeetActor: vi.fn(),
}));

vi.mock('../_lib/snapshot', () => ({
  callPrivateMeetRpc: (...args: unknown[]) => mocks.callPrivateMeetRpc(...args),
  loadMeetPlanSnapshot: (...args: unknown[]) =>
    mocks.loadMeetPlanSnapshot(...args),
  resolveOptionalMeetActor: (...args: unknown[]) =>
    mocks.resolveOptionalMeetActor(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => {
      const builder = {
        eq: (column: string, value: unknown) => {
          mocks.guestFilters.push([column, value]);
          return builder;
        },
        maybeSingle: () => mocks.guestLookup(),
        select: () => builder,
      };
      return builder;
    },
  }),
}));

const { PUT } = await import('./route');

function request(body: unknown) {
  return PUT(
    new NextRequest(
      `http://localhost/api/v1/meet/plans/${PLAN_ID}/availability`,
      { body: JSON.stringify(body), method: 'PUT' }
    ),
    { params: Promise.resolve({ planId: PLAN_ID }) }
  );
}

const timeblocks = [
  { date: '2026-08-04', start_time: '09:00:00+07', end_time: '09:15:00+07' },
];

describe('Meet availability guest credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guestFilters.length = 0;
    mocks.resolveOptionalMeetActor.mockResolvedValue(null);
    mocks.loadMeetPlanSnapshot.mockResolvedValue({
      plan: { id: PLAN_ID, is_confirmed: false },
    });
    mocks.callPrivateMeetRpc.mockResolvedValue({ error: null });
    mocks.guestLookup.mockResolvedValue({
      data: { id: GUEST_ID },
      error: null,
    });
  });

  it('accepts a server-issued guest session bound to the plan', async () => {
    const { token } = createMeetGuestSession({
      guestId: GUEST_ID,
      planId: PLAN_ID,
    });

    const response = await request({
      guestId: GUEST_ID,
      guestSession: token,
      timeblocks,
    });

    expect(response.status).toBe(200);
    expect(mocks.guestFilters).toEqual([
      ['plan_id', PLAN_ID],
      ['id', GUEST_ID],
    ]);
    expect(mocks.callPrivateMeetRpc).toHaveBeenCalledWith(
      'replace_meet_availability',
      expect.objectContaining({ p_is_guest: true, p_user_id: GUEST_ID })
    );
  });

  it('rejects a stored password hash presented as the guest credential', async () => {
    const response = await request({
      guestId: GUEST_ID,
      guestSession: STORED_HASH,
      timeblocks,
    });

    expect(response.status).toBe(401);
    expect(mocks.guestLookup).not.toHaveBeenCalled();
    expect(mocks.callPrivateMeetRpc).not.toHaveBeenCalled();
  });

  it('ignores the retired passwordHash field entirely', async () => {
    const response = await request({
      guestId: GUEST_ID,
      passwordHash: STORED_HASH,
      timeblocks,
    });

    expect(response.status).toBe(401);
    expect(mocks.callPrivateMeetRpc).not.toHaveBeenCalled();
  });

  it('rejects a session issued for another plan or another guest', async () => {
    const otherPlan = createMeetGuestSession({
      guestId: GUEST_ID,
      planId: 'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e1f',
    }).token;
    const otherGuest = createMeetGuestSession({
      guestId: 'another-guest',
      planId: PLAN_ID,
    }).token;

    for (const guestSession of [otherPlan, otherGuest]) {
      const response = await request({
        guestId: GUEST_ID,
        guestSession,
        timeblocks,
      });
      expect(response.status).toBe(401);
    }
    expect(mocks.callPrivateMeetRpc).not.toHaveBeenCalled();
  });

  it('rejects a valid session once the guest no longer belongs to the plan', async () => {
    mocks.guestLookup.mockResolvedValue({ data: null, error: null });
    const { token } = createMeetGuestSession({
      guestId: GUEST_ID,
      planId: PLAN_ID,
    });

    const response = await request({
      guestId: GUEST_ID,
      guestSession: token,
      timeblocks,
    });

    expect(response.status).toBe(401);
    expect(mocks.callPrivateMeetRpc).not.toHaveBeenCalled();
  });
});
