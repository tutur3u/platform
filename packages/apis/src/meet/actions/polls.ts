'use server';

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { revalidatePath } from 'next/cache';

export interface CreatePollInput {
  name: string;
  allow_anonymous_updates?: boolean;
}

export async function createPoll(planId: string, input: CreatePollInput) {
  const { name, allow_anonymous_updates = false } = input;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { error: 'Unauthorized' };
  }

  const sbAdmin = await createAdminClient();

  // Check if plan is confirmed
  const { data: plan } = await sbAdmin
    .from('meet_together_plans')
    .select('is_confirmed')
    .eq('id', planId)
    .single();

  if (plan?.is_confirmed) {
    return { error: 'Plan is confirmed. Poll creation is disabled.' };
  }

  const { data: poll, error } = await sbAdmin
    .from('polls')
    .insert({
      name,
      plan_id: planId,
      creator_id: user.id,
      allow_anonymous_updates,
    })
    .select(
      'id, name, plan_id, creator_id, allow_anonymous_updates, created_at'
    )
    .single();

  if (error) {
    return { error: 'Failed to create poll' };
  }

  revalidatePath(`/meet-together/plans/${planId}`);
  return { data: { poll } };
}

export async function deletePoll(planId: string, pollId: string) {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'Authentication required' };
    }

    // Check if plan is confirmed
    const { data: plan } = await sbAdmin
      .from('meet_together_plans')
      .select('is_confirmed')
      .eq('id', planId)
      .single();

    if (plan?.is_confirmed) {
      return { error: 'Plan is confirmed. Poll deletion is disabled.' };
    }

    // Check if the poll exists and get its creator
    const { data: poll, error: pollError } = await sbAdmin
      .from('polls')
      .select('creator_id, plan_id, name')
      .eq('id', pollId)
      .single();

    if (pollError || !poll) {
      return { error: pollError?.message || 'Poll not found' };
    }

    // Verify the poll belongs to the specified plan
    if (poll.plan_id !== planId) {
      return { error: 'Poll does not belong to the specified plan' };
    }

    // Check if the current user is the creator of the poll
    if (poll.creator_id !== user.id) {
      return { error: 'Only the poll creator can delete this poll' };
    }

    // Prevent deletion of "Where to Meet?" poll
    if (poll?.name === 'Where to Meet?') {
      return { error: 'Cannot delete the "Where to Meet?" poll' };
    }

    // Delete the poll (cascade deletion handles options and votes)
    const { error: deleteError } = await sbAdmin
      .from('polls')
      .delete()
      .eq('id', pollId);

    if (deleteError) {
      return { error: 'Error deleting poll' };
    }

    revalidatePath(`/meet-together/plans/${planId}`);
    return { data: { deletedPollId: pollId } };
  } catch {
    return { error: 'Internal server error' };
  }
}

export interface AddPollOptionInput {
  pollId: string;
  value: string;
  userType: 'PLATFORM' | 'GUEST';
  guestId?: string;
}

export async function addPollOption(planId: string, input: AddPollOptionInput) {
  const { pollId, value, userType, guestId } = input;
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  let userId: string | null = null;
  if (userType === 'PLATFORM') {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    if (!userId) {
      return { error: 'Unauthorized' };
    }
  }

  // Check if plan is confirmed
  const { data: pollWithPlan } = await sbAdmin
    .from('polls')
    .select('meet_together_plans!inner(is_confirmed)')
    .eq('id', pollId)
    .single();

  if (pollWithPlan?.meet_together_plans?.is_confirmed) {
    return { error: 'Plan is confirmed. Adding poll options is disabled.' };
  }

  // Insert new poll option
  const { data: option, error } = await sbAdmin
    .from('poll_options')
    .insert({
      poll_id: pollId,
      value,
    })
    .select('id, poll_id, value, created_at')
    .single();

  if (error) {
    return { error: 'Failed to add option' };
  }

  // Auto-vote for the new option
  if (userType === 'PLATFORM' && userId) {
    await sbAdmin.from('poll_user_votes').insert({
      user_id: userId,
      option_id: option.id,
    });
  } else if (userType === 'GUEST' && guestId) {
    await sbAdmin.from('poll_guest_votes').insert({
      guest_id: guestId,
      option_id: option.id,
    });
  }

  // Fetch votes for the new option
  const { data: userVotes = [] } = await sbAdmin
    .from('poll_user_votes')
    .select(
      `
      id,
      option_id,
      user_id,
      created_at,
      users!users_poll_votes_user_id_fkey(display_name)
    `
    )
    .eq('option_id', option.id);

  const { data: guestVotes = [] } = await sbAdmin
    .from('poll_guest_votes')
    .select(
      `
      id,
      option_id,
      guest_id,
      created_at,
      meet_together_guests!guest_poll_votes_guest_id_fkey(name)
    `
    )
    .eq('option_id', option.id);

  const totalVotes = (userVotes?.length || 0) + (guestVotes?.length || 0);

  const transformedUserVotes = (userVotes ?? []).map((vote) => ({
    id: vote.id,
    option_id: vote.option_id,
    user_id: vote.user_id,
    created_at: vote.created_at,
    user: {
      display_name: vote.users?.display_name || '',
    },
  }));

  const transformedGuestVotes = (guestVotes ?? []).map((vote) => ({
    id: vote.id,
    option_id: vote.option_id,
    guest_id: vote.guest_id,
    created_at: vote.created_at,
    guest: {
      display_name: vote.meet_together_guests?.name || '',
    },
  }));

  revalidatePath(`/meet-together/plans/${planId}`);
  return {
    data: {
      option: {
        ...option,
        userVotes: transformedUserVotes,
        guestVotes: transformedGuestVotes,
        totalVotes,
      },
    },
  };
}

export interface DeletePollOptionInput {
  userType: 'PLATFORM' | 'GUEST';
}

export async function deletePollOption(
  planId: string,
  optionId: string,
  input: DeletePollOptionInput
) {
  const { userType } = input;
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  // Only platform users allowed to delete
  if (userType !== 'PLATFORM') {
    return { error: 'Unauthorized' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { error: 'Unauthorized' };
  }

  // Check if plan is confirmed
  const { data: plan } = await sbAdmin
    .from('meet_together_plans')
    .select('is_confirmed')
    .eq('id', planId)
    .single();

  if (plan?.is_confirmed) {
    return { error: 'Plan is confirmed. Deleting poll options is disabled.' };
  }

  // Find poll_id for this option
  const { data: option, error: optionError } = await sbAdmin
    .from('poll_options')
    .select('poll_id')
    .eq('id', optionId)
    .single();

  if (optionError || !option) {
    return { error: 'Poll option not found' };
  }

  // Find the poll to check creator
  const { data: poll, error: pollError } = await sbAdmin
    .from('polls')
    .select('creator_id, plan_id')
    .eq('id', option.poll_id)
    .single();

  if (pollError || !poll) {
    return { error: 'Poll not found' };
  }

  // Check that user is the poll creator (and correct plan)
  if (poll.creator_id !== user.id || poll.plan_id !== planId) {
    return { error: 'Forbidden' };
  }

  // Delete the option (cascade deletes votes)
  const { error: deleteError } = await sbAdmin
    .from('poll_options')
    .delete()
    .eq('id', optionId);

  if (deleteError) {
    return { error: 'Failed to delete option' };
  }

  revalidatePath(`/meet-together/plans/${planId}`);
  return { data: { optionId } };
}

export interface SubmitVoteInput {
  pollId: string;
  optionIds: string[];
  userType: 'PLATFORM' | 'GUEST';
  guestId?: string;
}

export async function submitVote(planId: string, input: SubmitVoteInput) {
  const { pollId, optionIds, userType, guestId } = input;
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  let userId: string | null = null;

  if (userType === 'PLATFORM') {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    if (!userId) {
      return { error: 'Unauthorized' };
    }
  }

  // Check if plan is confirmed
  const { data: poll } = await sbAdmin
    .from('polls')
    .select('plan_id')
    .eq('id', pollId)
    .single();

  if (poll?.plan_id) {
    const { data: plan } = await sbAdmin
      .from('meet_together_plans')
      .select('is_confirmed')
      .eq('id', poll.plan_id)
      .single();

    if (plan?.is_confirmed) {
      return { error: 'Plan is confirmed. Voting is disabled.' };
    }
  }

  // Get all options for this poll
  const { data: pollOptions } = await sbAdmin
    .from('poll_options')
    .select('id')
    .eq('poll_id', pollId);

  const pollOptionIds = pollOptions?.map((o) => o.id) ?? [];

  // Delete previous votes
  if (userType === 'PLATFORM') {
    await sbAdmin
      .from('poll_user_votes')
      .delete()
      .match({ user_id: userId })
      .in('option_id', pollOptionIds);
  } else if (userType === 'GUEST' && guestId) {
    await sbAdmin
      .from('poll_guest_votes')
      .delete()
      .match({ guest_id: guestId })
      .in('option_id', pollOptionIds);
  }

  // Insert new votes
  if (userType === 'PLATFORM' && userId) {
    const validOptionIds = optionIds.filter((id: string) =>
      pollOptionIds.includes(id)
    );

    if (validOptionIds.length !== optionIds.length) {
      return { error: 'Some option IDs are invalid for this poll' };
    }

    const toInsert = validOptionIds.map((option_id: string) => ({
      user_id: userId,
      option_id,
    }));
    if (toInsert.length > 0) {
      const { error: insertError } = await sbAdmin
        .from('poll_user_votes')
        .insert(toInsert);
      if (insertError) {
        return { error: 'Failed to submit votes' };
      }
    }
  } else if (userType === 'GUEST' && guestId) {
    const validOptionIds = optionIds.filter((id: string) =>
      pollOptionIds.includes(id)
    );

    if (validOptionIds.length !== optionIds.length) {
      return { error: 'Some option IDs are invalid for this poll' };
    }

    const toInsert = validOptionIds.map((option_id: string) => ({
      guest_id: guestId,
      option_id,
    }));
    if (toInsert.length > 0) {
      const { error: insertError } = await sbAdmin
        .from('poll_guest_votes')
        .insert(toInsert);
      if (insertError) {
        return { error: 'Failed to submit votes' };
      }
    }
  } else {
    return { error: 'Invalid vote request' };
  }

  revalidatePath(`/meet-together/plans/${planId}`);
  return { data: { success: true } };
}

export async function toggleWherePoll(planId: string, whereToMeet: boolean) {
  try {
    const sbAdmin = await createAdminClient();
    const supabase = await createClient();

    if (typeof whereToMeet !== 'boolean') {
      return { error: 'whereToMeet must be a boolean' };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Unauthorized' };
    }

    // Check if plan is confirmed
    const { data: plan } = await sbAdmin
      .from('meet_together_plans')
      .select('is_confirmed')
      .eq('id', planId)
      .single();

    if (plan?.is_confirmed) {
      return { error: 'Plan is confirmed. Where-poll updates are disabled.' };
    }

    // Update where_to_meet field
    const { data: updatedPlan, error: updateError } = await sbAdmin
      .from('meet_together_plans')
      .update({ where_to_meet: whereToMeet })
      .eq('id', planId)
      .select('id, where_to_meet')
      .single();

    if (updateError || !updatedPlan) {
      return { error: 'Error updating plan' };
    }

    // If enabling where_to_meet, ensure the poll exists
    let pollId: string | null = null;
    if (whereToMeet) {
      const { data: poll, error: pollFetchError } = await sbAdmin
        .from('polls')
        .select('id')
        .eq('plan_id', planId)
        .eq('name', 'Where to Meet?')
        .maybeSingle();

      if (pollFetchError) {
        return { error: 'Error checking poll' };
      }

      if (poll?.id) {
        pollId = poll.id;
      } else {
        const { data: newPoll, error: createPollError } = await sbAdmin
          .from('polls')
          .insert({
            plan_id: planId,
            creator_id: user.id,
            name: 'Where to Meet?',
          })
          .select('id')
          .single();

        if (createPollError) {
          return {
            data: {
              id: planId,
              where_to_meet: updatedPlan.where_to_meet,
            },
            warning: 'Plan updated, but failed to create poll',
          };
        }
        pollId = newPoll?.id;
      }
    }

    revalidatePath(`/meet-together/plans/${planId}`);
    return {
      data: {
        id: planId,
        where_to_meet: updatedPlan.where_to_meet,
        pollId,
      },
    };
  } catch (error) {
    console.error(error);
    return { error: 'Invalid request' };
  }
}
