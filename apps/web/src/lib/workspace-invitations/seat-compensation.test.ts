import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasPendingInvitationSeatCompensation,
  revokeInvitationSeatOrRecord,
} from './seat-compensation';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function createAdminMock({
  pending = null,
  queryError = null,
  upsertError = null,
}: {
  pending?: { seat_id: string } | null;
  queryError?: unknown;
  upsertError?: unknown;
} = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: upsertError });
  const deleteResult = Promise.resolve({ error: null });
  const deleteBuilder = Object.assign(deleteResult, {
    eq: vi.fn(),
  });
  deleteBuilder.eq.mockReturnValue(deleteBuilder);
  const deleteRecord = vi.fn().mockReturnValue(deleteBuilder);
  const builder = {
    delete: deleteRecord,
    eq: vi.fn(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: pending, error: queryError }),
    select: vi.fn(),
    upsert,
  };
  builder.eq.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  const from = vi.fn().mockReturnValue(builder);
  const schema = vi.fn().mockReturnValue({ from });

  return {
    admin: { schema } as unknown as TypedSupabaseClient,
    delete: deleteRecord,
    upsert,
  };
}

function createPolarMock(revokeSeat: ReturnType<typeof vi.fn>) {
  return { customerSeats: { revokeSeat } } as unknown as Polar;
}

describe('invitation seat compensation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fails closed for either a pending record or an unavailable store', async () => {
    const pending = createAdminMock({ pending: { seat_id: 'seat-1' } });
    const unavailable = createAdminMock({ queryError: new Error('offline') });

    await expect(
      hasPendingInvitationSeatCompensation(pending.admin, WORKSPACE_ID, USER_ID)
    ).resolves.toBe(true);
    await expect(
      hasPendingInvitationSeatCompensation(
        unavailable.admin,
        WORKSPACE_ID,
        USER_ID
      )
    ).resolves.toBe(true);
  });

  it('records compensation before revoking and clears it after success', async () => {
    const { admin, delete: deleteRecord, upsert } = createAdminMock();
    const revokeSeat = vi.fn().mockResolvedValue(undefined);

    await expect(
      revokeInvitationSeatOrRecord({
        admin,
        polar: createPolarMock(revokeSeat),
        seatId: 'seat-1',
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
      })
    ).resolves.toBe(true);
    expect(revokeSeat).toHaveBeenCalledWith({ seatId: 'seat-1' });
    expect(upsert).toHaveBeenCalledOnce();
    expect(deleteRecord).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledBefore(revokeSeat);
    expect(revokeSeat).toHaveBeenCalledBefore(deleteRecord);
  });

  it('persists a retryable record when Polar revocation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin, upsert } = createAdminMock();

    await expect(
      revokeInvitationSeatOrRecord({
        admin,
        polar: createPolarMock(
          vi.fn().mockRejectedValue(new Error('Polar unavailable'))
        ),
        seatId: 'seat-1',
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
      })
    ).resolves.toBe(false);
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        last_error: 'Polar unavailable',
        seat_id: 'seat-1',
        user_id: USER_ID,
        ws_id: WORKSPACE_ID,
      }),
      { onConflict: 'ws_id,user_id,seat_id' }
    );
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('does not call Polar when the durable record cannot be created', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin } = createAdminMock({ upsertError: new Error('offline') });
    const revokeSeat = vi.fn();

    await expect(
      revokeInvitationSeatOrRecord({
        admin,
        polar: createPolarMock(revokeSeat),
        seatId: 'seat-1',
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
      })
    ).rejects.toThrow('Unable to persist invitation seat compensation');
    expect(revokeSeat).not.toHaveBeenCalled();
  });
});
