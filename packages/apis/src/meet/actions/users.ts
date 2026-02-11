'use server';

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { revalidatePath } from 'next/cache';

export async function removeUserFromPlan(planId: string, userId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const sbAdmin = await createAdminClient();

  // Check if the current user is the plan creator
  const { data: plan, error: planError } = await sbAdmin
    .from('meet_together_plans')
    .select('creator_id')
    .eq('id', planId)
    .single();

  if (planError || !plan) {
    return { error: 'Plan not found' };
  }

  if (plan.creator_id !== user.id) {
    return { error: 'Only the plan creator can remove users' };
  }

  // Prevent the creator from removing themselves
  if (userId === user.id) {
    return { error: 'Cannot remove yourself from the plan' };
  }

  try {
    // Delete user timeblocks
    const { error: timeblockError } = await sbAdmin
      .from('meet_together_user_timeblocks')
      .delete()
      .eq('plan_id', planId)
      .eq('user_id', userId);

    if (timeblockError) {
      return { error: 'Error removing user from plan' };
    }

    // Delete guest timeblocks for this user
    const { error: guestTimeblockError } = await sbAdmin
      .from('meet_together_guest_timeblocks')
      .delete()
      .eq('plan_id', planId)
      .eq('user_id', userId);

    if (guestTimeblockError) {
      return { error: 'Error removing user from plan' };
    }

    // Delete guest votes from polls for this user
    const { error: guestVoteError } = await sbAdmin
      .from('poll_guest_votes')
      .delete()
      .eq('guest_id', userId);

    if (guestVoteError) {
      return { error: 'Error removing user from plan' };
    }

    revalidatePath(`/meet-together/plans/${planId}`);
    return {
      data: { success: true, message: 'User removed from plan successfully' },
    };
  } catch {
    return { error: 'Error removing user from plan' };
  }
}
