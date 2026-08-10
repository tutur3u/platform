'use server';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { revalidatePath } from 'next/cache';

interface PollParticipantInput {
  userType: 'PLATFORM' | 'GUEST';
  guestId?: string;
  guestPasswordHash?: string;
}

type PollActor =
  | { id: string; type: 'PLATFORM' }
  | { id: string; type: 'GUEST' };

type PollActorResolution =
  | { actor: PollActor; sbAdmin: TypedSupabaseClient }
  | { error: string };

async function resolvePollActor(
  planId: string,
  input: PollParticipantInput
): Promise<PollActorResolution> {
  if (input.userType === 'PLATFORM') {
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user?.id) {
      return { error: 'Unauthorized' };
    }

    return {
      actor: { id: user.id, type: 'PLATFORM' },
      sbAdmin: await createAdminClient(),
    };
  }

  if (!input.guestId || !input.guestPasswordHash) {
    return { error: 'Unauthorized' };
  }

  const sbAdmin = await createAdminClient();
  const { data: guest, error } = await sbAdmin
    .from('meet_together_guests')
    .select('id')
    .eq('plan_id', planId)
    .eq('id', input.guestId)
    .eq('password_hash', input.guestPasswordHash)
    .maybeSingle();

  if (error || !guest) {
    return { error: 'Unauthorized' };
  }

  return {
    actor: { id: guest.id, type: 'GUEST' },
    sbAdmin,
  };
}

async function getMutablePoll(
  sbAdmin: TypedSupabaseClient,
  planId: string,
  pollId: string
) {
  const { data: poll, error: pollError } = await sbAdmin
    .from('polls')
    .select('id, creator_id, plan_id, name')
    .eq('id', pollId)
    .eq('plan_id', planId)
    .maybeSingle();

  if (pollError || !poll) {
    return { error: 'Poll not found' } as const;
  }

  const { data: plan, error: planError } = await sbAdmin
    .from('meet_together_plans')
    .select('is_confirmed')
    .eq('id', planId)
    .maybeSingle();

  if (planError || !plan) {
    return { error: 'Plan not found' } as const;
  }

  return { plan, poll } as const;
}

export interface CreatePollInput {
  name: string;
  allow_anonymous_updates?: boolean;
}

export async function createPoll(planId: string, input: CreatePollInput) {
  const { name, allow_anonymous_updates = false } = input;

  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user?.id) {
    return { error: 'Unauthorized' };
  }

  const sbAdmin = await createAdminClient();

  // Check if plan is confirmed
  const { data: plan, error: planError } = await sbAdmin
    .from('meet_together_plans')
    .select('creator_id, is_confirmed')
    .eq('id', planId)
    .maybeSingle();

  if (planError || !plan) {
    return { error: 'Plan not found' };
  }

  if (plan.creator_id !== user.id) {
    return { error: 'You are not the creator of this plan' };
  }

  if (plan.is_confirmed) {
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

  revalidatePath(`/meet/plans/${planId}`);
  return { data: { poll } };
}

export async function deletePoll(planId: string, pollId: string) {
  try {
    const actorResult = await resolvePollActor(planId, {
      userType: 'PLATFORM',
    });
    if ('error' in actorResult) {
      return { error: 'Authentication required' };
    }

    const { actor, sbAdmin } = actorResult;
    const pollResult = await getMutablePoll(sbAdmin, planId, pollId);
    if ('error' in pollResult) {
      return { error: pollResult.error };
    }

    if (pollResult.plan.is_confirmed) {
      return { error: 'Plan is confirmed. Poll deletion is disabled.' };
    }

    // Check if the current user is the creator of the poll
    if (pollResult.poll.creator_id !== actor.id) {
      return { error: 'Only the poll creator can delete this poll' };
    }

    // Prevent deletion of "Where to Meet?" poll
    if (pollResult.poll.name === 'Where to Meet?') {
      return { error: 'Cannot delete the "Where to Meet?" poll' };
    }

    // Delete the poll (cascade deletion handles options and votes)
    const { error: deleteError } = await sbAdmin
      .from('polls')
      .delete()
      .eq('id', pollId)
      .eq('plan_id', planId);

    if (deleteError) {
      return { error: 'Error deleting poll' };
    }

    revalidatePath(`/meet/plans/${planId}`);
    return { data: { deletedPollId: pollId } };
  } catch {
    return { error: 'Internal server error' };
  }
}

export interface AddPollOptionInput extends PollParticipantInput {
  pollId: string;
  value: string;
}

export async function addPollOption(planId: string, input: AddPollOptionInput) {
  const { pollId, value } = input;
  const actorResult = await resolvePollActor(planId, input);
  if ('error' in actorResult) {
    return { error: actorResult.error };
  }

  const { actor, sbAdmin } = actorResult;
  const pollResult = await getMutablePoll(sbAdmin, planId, pollId);
  if ('error' in pollResult) {
    return { error: pollResult.error };
  }

  if (pollResult.plan.is_confirmed) {
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
  if (actor.type === 'PLATFORM') {
    await sbAdmin.from('poll_user_votes').insert({
      user_id: actor.id,
      option_id: option.id,
    });
  } else {
    await sbAdmin.from('poll_guest_votes').insert({
      guest_id: actor.id,
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

  revalidatePath(`/meet/plans/${planId}`);
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

  // Only platform users allowed to delete
  if (userType !== 'PLATFORM') {
    return { error: 'Unauthorized' };
  }

  const actorResult = await resolvePollActor(planId, { userType });
  if ('error' in actorResult) {
    return { error: actorResult.error };
  }

  const { actor, sbAdmin } = actorResult;
  // Find poll_id for this option
  const { data: option, error: optionError } = await sbAdmin
    .from('poll_options')
    .select('poll_id')
    .eq('id', optionId)
    .single();

  if (optionError || !option) {
    return { error: 'Poll option not found' };
  }

  const pollResult = await getMutablePoll(sbAdmin, planId, option.poll_id);
  if ('error' in pollResult) {
    return { error: pollResult.error };
  }

  if (pollResult.plan.is_confirmed) {
    return { error: 'Plan is confirmed. Deleting poll options is disabled.' };
  }

  // Check that user is the poll creator (and correct plan)
  if (pollResult.poll.creator_id !== actor.id) {
    return { error: 'Forbidden' };
  }

  // Delete the option (cascade deletes votes)
  const { error: deleteError } = await sbAdmin
    .from('poll_options')
    .delete()
    .eq('id', optionId)
    .eq('poll_id', pollResult.poll.id);

  if (deleteError) {
    return { error: 'Failed to delete option' };
  }

  revalidatePath(`/meet/plans/${planId}`);
  return { data: { optionId } };
}

export interface SubmitVoteInput extends PollParticipantInput {
  pollId: string;
  optionIds: string[];
}

export async function submitVote(planId: string, input: SubmitVoteInput) {
  const { pollId, optionIds } = input;
  const actorResult = await resolvePollActor(planId, input);
  if ('error' in actorResult) {
    return { error: actorResult.error };
  }

  const { actor, sbAdmin } = actorResult;
  const pollResult = await getMutablePoll(sbAdmin, planId, pollId);
  if ('error' in pollResult) {
    return { error: pollResult.error };
  }

  if (pollResult.plan.is_confirmed) {
    return { error: 'Plan is confirmed. Voting is disabled.' };
  }

  // Get all options for this poll
  const { data: pollOptions } = await sbAdmin
    .from('poll_options')
    .select('id')
    .eq('poll_id', pollId);

  const pollOptionIds = pollOptions?.map((o) => o.id) ?? [];
  const validOptionIds = optionIds.filter((id: string) =>
    pollOptionIds.includes(id)
  );

  if (validOptionIds.length !== optionIds.length) {
    return { error: 'Some option IDs are invalid for this poll' };
  }

  // Delete previous votes
  if (actor.type === 'PLATFORM' && pollOptionIds.length > 0) {
    await sbAdmin
      .from('poll_user_votes')
      .delete()
      .match({ user_id: actor.id })
      .in('option_id', pollOptionIds);
  } else if (actor.type === 'GUEST' && pollOptionIds.length > 0) {
    await sbAdmin
      .from('poll_guest_votes')
      .delete()
      .match({ guest_id: actor.id })
      .in('option_id', pollOptionIds);
  }

  // Insert new votes
  if (actor.type === 'PLATFORM') {
    const toInsert = validOptionIds.map((option_id: string) => ({
      user_id: actor.id,
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
  } else {
    const toInsert = validOptionIds.map((option_id: string) => ({
      guest_id: actor.id,
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
  }

  revalidatePath(`/meet/plans/${planId}`);
  return { data: { success: true } };
}

export async function toggleWherePoll(planId: string, whereToMeet: boolean) {
  try {
    if (typeof whereToMeet !== 'boolean') {
      return { error: 'whereToMeet must be a boolean' };
    }

    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);
    if (!user?.id) {
      return { error: 'Unauthorized' };
    }

    const sbAdmin = await createAdminClient();
    // Check if plan is confirmed
    const { data: plan, error: planError } = await sbAdmin
      .from('meet_together_plans')
      .select('creator_id, is_confirmed')
      .eq('id', planId)
      .maybeSingle();

    if (planError || !plan) {
      return { error: 'Plan not found' };
    }

    if (plan.creator_id !== user.id) {
      return { error: 'You are not the creator of this plan' };
    }

    if (plan.is_confirmed) {
      return { error: 'Plan is confirmed. Where-poll updates are disabled.' };
    }

    // Update where_to_meet field
    const { data: updatedPlan, error: updateError } = await sbAdmin
      .from('meet_together_plans')
      .update({ where_to_meet: whereToMeet })
      .eq('id', planId)
      .eq('creator_id', user.id)
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

    revalidatePath(`/meet/plans/${planId}`);
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
