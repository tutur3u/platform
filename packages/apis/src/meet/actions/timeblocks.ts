'use server';

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { revalidatePath } from 'next/cache';

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
  password_hash?: string;
  user_id?: string;
}

export async function createTimeblocks(
  planId: string,
  input: CreateTimeblocksInput
) {
  const supabase = await createClient();

  const timeblocks =
    input.timeblocks || (input.timeblock ? [input.timeblock] : []);
  const passwordHash = input.password_hash;
  const userType = passwordHash ? 'guest' : 'user';

  if (!timeblocks || timeblocks.length === 0) {
    return { error: 'Invalid request' };
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    revalidatePath(`/meet-together/plans/${planId}`);
    return {
      data: {
        ids: insertedTimeblocks?.map((tb) => tb.id) || [],
      },
    };
  } else {
    if (!input.user_id || !passwordHash) {
      return { error: 'Missing user_id or password_hash for guest user' };
    }

    const { data: guest } = await sbAdmin
      .from('meet_together_guests')
      .select('id')
      .eq('id', input.user_id)
      .eq('password_hash', passwordHash)
      .maybeSingle();

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

    revalidatePath(`/meet-together/plans/${planId}`);
    return {
      data: {
        ids: insertedTimeblocks?.map((tb) => tb.id) || [],
      },
    };
  }
}

export interface DeleteTimeblockInput {
  password_hash?: string;
  user_id?: string;
}

export async function deleteTimeblock(
  planId: string,
  timeblockId: string,
  input: DeleteTimeblockInput = {}
) {
  const supabase = await createClient();

  const passwordHash = input.password_hash;
  const userType = passwordHash ? 'guest' : 'user';

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
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    if (!userId || !passwordHash) {
      return { error: 'Missing user_id or password_hash for guest user' };
    }

    const { data: guest } = await sbAdmin
      .from('meet_together_guests')
      .select('id')
      .eq('plan_id', planId)
      .eq('id', userId)
      .eq('password_hash', passwordHash)
      .maybeSingle();

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

  revalidatePath(`/meet-together/plans/${planId}`);
  return { data: { success: true } };
}
