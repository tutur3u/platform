import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { PlanUser } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type {
  GuestVoteWithGuestInfo,
  PollOption,
  UserVoteWithUserInfo,
} from '@tuturuuu/types/primitives/Poll';
import { TimeBlockingProvider } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { getPlan } from '@tuturuuu/utils/plan-helpers';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import 'dayjs/locale/vi';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import PlanDetailsClient from './plan-details-client';

interface Props {
  params: Promise<{
    planId: string;
  }>;
  baseUrl: string;
}

export default async function MeetTogetherPlanDetailsPage({
  params,
  baseUrl,
}: Props) {
  const { planId } = await params;

  const platformUser = await getCurrentUser(true);
  const plan = await getPlan(planId);
  const users: PlanUser[] = await getUsers(planId);
  const polls = await getPollsForPlan(planId);
  const timeblocks = await getTimeBlocks(planId);

  return (
    <div className="flex min-h-screen w-full flex-col items-center">
      <Suspense fallback={null}>
        {plan.id && (
          <TimeBlockingProvider
            key={`${platformUser?.id || 'guest'}-${plan.id}`}
            platformUser={platformUser}
            plan={plan}
            users={users}
            timeblocks={timeblocks}
          >
            <PlanDetailsClient
              plan={plan}
              // isCreator={isCreator}
              polls={polls}
              users={users}
              timeblocks={timeblocks}
              baseUrl={baseUrl}
            />
          </TimeBlockingProvider>
        )}
      </Suspense>
    </div>
  );
}

async function getUsers(planId: string) {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('meet_together_users')
    .select('id:user_id, display_name, is_guest, timeblock_count')
    .eq('plan_id', planId);

  if (error) {
    console.error(error);
    return notFound();
  }

  return data;
}

async function getTimeBlocks(planId: string) {
  const sbAdmin = await createAdminClient();

  const guestQueryBuilder = sbAdmin
    .from('meet_together_guest_timeblocks')
    .select('*')
    .eq('plan_id', planId);

  const userQueryBuilder = sbAdmin
    .from('meet_together_user_timeblocks')
    .select('*')
    .eq('plan_id', planId);

  const [guestTimeBlocks, userTimeBlocks] = await Promise.all([
    guestQueryBuilder,
    userQueryBuilder,
  ]);

  if (guestTimeBlocks.error || userTimeBlocks.error) {
    console.log(guestTimeBlocks.error, userTimeBlocks.error);
    return notFound();
  }

  return [
    ...guestTimeBlocks.data.map((tb) => ({
      ...tb,
      is_guest: true,
    })),
    ...userTimeBlocks.data.map((tb) => ({
      ...tb,
      is_guest: false,
    })),
  ];
}
async function getPollsForPlan(planId: string) {
  const sbAdmin = await createAdminClient();

  // 1. Get all polls for the plan
  const { data: polls, error: pollsError } = await sbAdmin
    .from('polls')
    .select(
      'id, name, plan_id, created_at, creator_id, allow_anonymous_updates'
    )
    .eq('plan_id', planId);

  if (pollsError) {
    console.log('Error fetching polls');
    return {
      error: 'Error fetching polls',
      polls: null,
      userVotes: [],
      guestVotes: [],
    };
  }

  // 2. Get options for all polls
  const pollIds = polls?.map((p) => p.id) ?? [];
  let allOptions: PollOption[] = [];
  if (pollIds.length > 0) {
    const { data: options, error: optionsError } = await sbAdmin
      .from('poll_options')
      .select('id, poll_id, value, created_at')
      .in('poll_id', pollIds);

    if (optionsError) {
      console.log('Error fetching poll options');
      return {
        error: 'Error fetching poll options',
        polls: null,
        userVotes: [],
        guestVotes: [],
      };
    }
    allOptions = options ?? [];
  }

  // 3. Get user and guest votes for all poll options
  const optionIds = allOptions.map((o) => o.id);
  let userVotes: UserVoteWithUserInfo[] = [];
  let guestVotes: GuestVoteWithGuestInfo[] = [];
  if (optionIds.length > 0) {
    // Platform user votes
    const { data: uVotes, error: uVotesError } = await sbAdmin
      .from('poll_user_votes')
      .select(
        'id, option_id, user_id, created_at, users!users_poll_votes_user_id_fkey(display_name)'
      )
      .in('option_id', optionIds);

    // Guest votes
    const { data: gVotes, error: gVotesError } = await sbAdmin
      .from('poll_guest_votes')
      .select(
        'id, option_id, guest_id, created_at, meet_together_guests!guest_poll_votes_guest_id_fkey(name)'
      )
      .in('option_id', optionIds);

    if (uVotesError || gVotesError) {
      console.log('Error fetching votes');
      return {
        error: 'Error fetching votes',
        polls: null,
        userVotes: [],
        guestVotes: [],
      };
    }

    // Transform the data to match the expected types
    userVotes = (uVotes ?? []).map((vote) => ({
      id: vote.id,
      option_id: vote.option_id,
      user_id: vote.user_id,
      created_at: vote.created_at,
      user: {
        display_name: vote.users?.display_name || '',
      },
    }));

    guestVotes = (gVotes ?? []).map((vote) => ({
      id: vote.id,
      option_id: vote.option_id,
      guest_id: vote.guest_id,
      created_at: vote.created_at,
      guest: {
        display_name: vote.meet_together_guests?.name || '',
      },
    }));
  }

  // 4. Attach options and their votes to polls
  const pollsWithOptions = polls.map((poll) => {
    const options = allOptions
      .filter((opt) => opt.poll_id === poll.id)
      .map((opt) => {
        const optionUserVotes = userVotes.filter((v) => v.option_id === opt.id);
        const optionGuestVotes = guestVotes.filter(
          (v) => v.option_id === opt.id
        );

        return {
          ...opt,
          userVotes: optionUserVotes,
          guestVotes: optionGuestVotes,
          totalVotes: optionUserVotes.length + optionGuestVotes.length,
        };
      });

    return {
      ...poll,
      options,
    };
  });

  return {
    polls: pollsWithOptions,
    userVotes,
    guestVotes,
  };
}
