import type { Polar } from '@tuturuuu/payment/polar';
import { revokeAssignedSeat } from '@tuturuuu/payment-core/polar-seat-helper';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type CompensationTable = {
  delete: () => CompensationDelete;
  eq: (column: string, value: string) => CompensationTable;
  maybeSingle: () => Promise<{
    data: { seat_id: string } | null;
    error: unknown;
  }>;
  select: (columns: 'seat_id') => CompensationTable;
  upsert: (
    value: Record<string, string>,
    options: { onConflict: 'ws_id,user_id,seat_id' }
  ) => Promise<{ error: unknown }>;
};

type CompensationDelete = {
  eq: (column: string, value: string) => CompensationDelete;
  then: Promise<{ error: unknown }>['then'];
};

function compensationTable(admin: TypedSupabaseClient) {
  const privateSchema = admin.schema('private') as unknown as {
    from: (table: string) => CompensationTable;
  };
  return privateSchema.from('pending_invitation_seat_revocations');
}

export async function hasPendingInvitationSeatCompensation(
  admin: TypedSupabaseClient,
  workspaceId: string,
  userId: string
) {
  const { data, error } = await compensationTable(admin)
    .select('seat_id')
    .eq('ws_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(error || data);
}

export async function revokeInvitationSeatOrRecord({
  admin,
  polar,
  seatId,
  userId,
  workspaceId,
}: {
  admin: TypedSupabaseClient;
  polar: Polar;
  seatId: string;
  userId: string;
  workspaceId: string;
}) {
  const compensation = {
    last_error: 'Seat revocation pending',
    seat_id: seatId,
    user_id: userId,
    ws_id: workspaceId,
  };
  const { error: recordError } = await compensationTable(admin).upsert(
    compensation,
    { onConflict: 'ws_id,user_id,seat_id' }
  );
  if (recordError) {
    console.error('Failed to persist invitation seat compensation', {
      recordError,
      seatId,
      userId,
      workspaceId,
    });
    throw new Error('Unable to persist invitation seat compensation');
  }

  try {
    await revokeAssignedSeat(polar, seatId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { error: updateError } = await compensationTable(admin).upsert(
      { ...compensation, last_error: message },
      { onConflict: 'ws_id,user_id,seat_id' }
    );
    console.error('Failed to revoke invitation seat', {
      error,
      updateError,
      seatId,
      userId,
      workspaceId,
    });
    return false;
  }

  const { error: clearError } = await compensationTable(admin)
    .delete()
    .eq('ws_id', workspaceId)
    .eq('user_id', userId)
    .eq('seat_id', seatId);
  if (clearError) {
    console.error('Failed to clear invitation seat compensation', {
      clearError,
      seatId,
      userId,
      workspaceId,
    });
    return false;
  }
  return true;
}
