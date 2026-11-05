'use server';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { getPlan } from '@tuturuuu/utils/plan-helpers';
import { revalidatePath } from 'next/cache';
import { resolveMeetGuestFromSession } from '../guest-session';

export async function getTimeblocks(planId: string) {
  const sbAdmin = await createAdminClient();

  const guestTimeBlocksQuery = sbAdmin
    .from('meet_together_guest_timeblocks')
    .select('*')
    .eq('plan_id', planId);

  const userTimeBlocksQuery = sbAdmin
    .from('meet_together_user_timeblocks')
    .select('*')
    .eq('plan_id', planId);

  const [guestTimeBlocks, userTimeBlocks] = await Promise.all([
    guestTimeBlocksQuery,
    userTimeBlocksQuery,
  ]);

  const errors = {
    guest: guestTimeBlocks.error,
    user: userTimeBlocks.error,
  };

  if (errors.guest || errors.user) {
    return { error: 'Error fetching meet together timeblocks' };
  }

  const timeblocks = [
    ...(guestTimeBlocks?.data || []).map((tb) => ({ ...tb, is_guest: true })),
    ...(userTimeBlocks?.data || []).map((tb) => ({ ...tb, is_guest: false })),
  ];

  return { data: timeblocks };
}

export interface CreateTimeblocksInput {
  timeblocks?: Timeblock[];
  timeblock?: Timeblock;
  /** Server-issued guest session from `guestLogin`, never a stored hash. */
  guest_session?: string;
  user_id?: string;
}

export async function createTimeblocks(
  planId: string,
  input: CreateTimeblocksInput
) {
  const supabase = await createClient();

  const timeblocks =
    input.timeblocks || (input.timeblock ? [input.timeblock] : []);
  const guestSession = input.guest_session;
  const userType = guestSession ? 'guest' : 'user';

  if (!timeblocks || timeblocks.length === 0) {
    return { error: 'Invalid request' };
  }

  // Guests only reach public, non-workspace plans, even with a live session
  // issued before the plan stopped being public.
  if (userType === 'guest' && !(await getPlan(planId, { actorUserId: null }))) {
    return { error: 'Unauthorized' };
  }

  // Check if plan is confirmed
  const sbAdmin = await createAdminClient();
  const { data: plan } = await sbAdmin
    .from('meet_together_plans')
    .select('is_confirmed')
    .eq('id', planId)
    .single();

  if (plan?.is_confirmed) {
    return { error: 'Plan is confirmed. Adding availability is disabled.' };
  }

  // Clean up timeblocks - remove is_guest field
  const cleanedTimeblocks = timeblocks.map((timeblock: Timeblock) => {
    const cleaned = { ...timeblock };
    delete cleaned.is_guest;
    return cleaned;
  });

  if (userType === 'user') {
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user?.id) {
      return { error: 'Unauthorized' };
    }

    const timeblocksToInsert = cleanedTimeblocks.map(
      (timeblock: Timeblock) => ({
        date: timeblock.date,
        start_time: timeblock.start_time,
        end_time: timeblock.end_time,
        tentative: timeblock.tentative,
        plan_id: planId,
        user_id: user.id,
      })
    );

    const { data: insertedTimeblocks, error } = await supabase
      .from('meet_together_user_timeblocks')
      .insert(timeblocksToInsert)
      .select('id');

    if (error) {
      console.log(error);
      return { error: 'Error creating timeblocks' };
    }

    revalidatePath(`/meet/plans/${planId}`);
    return {
      data: {
        ids: insertedTimeblocks?.map((tb) => tb.id) || [],
      },
    };
  } else {
    if (!input.user_id || !guestSession) {
      return { error: 'Missing user_id or guest_session for guest user' };
    }

    const guest = await resolveMeetGuestFromSession(
      sbAdmin,
      planId,
      guestSession,
      input.user_id
    );

    if (!guest) {
      return { error: 'Unauthorized' };
    }

    const guestUserId = input.user_id;
    const timeblocksToInsert = cleanedTimeblocks.map(
      (timeblock: Timeblock) => ({
        date: timeblock.date,
        start_time: timeblock.start_time,
        end_time: timeblock.end_time,
        tentative: timeblock.tentative,
        plan_id: planId,
        user_id: guestUserId,
      })
    );

    const { data: insertedTimeblocks, error } = await sbAdmin
      .from('meet_together_guest_timeblocks')
      .insert(timeblocksToInsert)
      .select('id');

    if (error) {
      console.log(error);
      return { error: 'Error creating timeblocks' };
    }

    revalidatePath(`/meet/plans/${planId}`);
    return {
      data: {
        ids: insertedTimeblocks?.map((tb) => tb.id) || [],
      },
    };
  }
}

export interface DeleteTimeblockInput {
  /** Server-issued guest session from `guestLogin`, never a stored hash. */
  guest_session?: string;
  user_id?: string;
}

export async function deleteTimeblock(
  planId: string,
  timeblockId: string,
  input: DeleteTimeblockInput = {}
) {
  const supabase = await createClient();

  const guestSession = input.guest_session;
  const userType = guestSession ? 'guest' : 'user';

  // Guests only reach public, non-workspace plans, even with a live session
  // issued before the plan stopped being public.
  if (userType === 'guest' && !(await getPlan(planId, { actorUserId: null }))) {
    return { error: 'Unauthorized' };
  }

  // Check if plan is confirmed
  const sbAdmin = await createAdminClient();
  const { data: plan } = await sbAdmin
    .from('meet_together_plans')
    .select('is_confirmed')
    .eq('id', planId)
    .single();

  if (plan?.is_confirmed) {
    return { error: 'Plan is confirmed. Removing availability is disabled.' };
  }

  if (userType === 'user') {
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      return { error: 'Unauthorized' };
    }

    const userId = user?.id;

    const { error } = await supabase
      .from('meet_together_user_timeblocks')
      .delete()
      .eq('plan_id', planId)
      .eq('id', timeblockId)
      .eq('user_id', userId);

    if (error) {
      console.log(error);
      return { error: 'Error deleting timeblock' };
    }
  } else {
    const userId = input.user_id;

    if (!userId || !guestSession) {
      return { error: 'Missing user_id or guest_session for guest user' };
    }

    const guest = await resolveMeetGuestFromSession(
      sbAdmin,
      planId,
      guestSession,
      userId
    );

    if (!guest) {
      return { error: 'Unauthorized' };
    }

    const { error } = await sbAdmin
      .from('meet_together_guest_timeblocks')
      .delete()
      .eq('plan_id', planId)
      .eq('id', timeblockId)
      .eq('user_id', userId);

    if (error) {
      console.log(error);
      return { error: 'Error deleting timeblock' };
    }
  }

  revalidatePath(`/meet/plans/${planId}`);
  return { data: { success: true } };
}
