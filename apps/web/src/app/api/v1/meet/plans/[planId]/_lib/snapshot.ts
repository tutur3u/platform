import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type {
  MeetFinalizedTimeframe,
  PlanUser,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import {
  getPlan,
  normalizeMeetTogetherPlanId,
} from '@tuturuuu/utils/plan-helpers';
import type { NextRequest } from 'next/server';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { resolveSessionAuthContext } from '@/lib/api-auth';

export interface MeetActor {
  id: string;
}

export async function resolveOptionalMeetActor(request: NextRequest) {
  if (request.headers.get('cookie')?.includes('tuturuuu_app_session=')) {
    const resolution = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
    });
    return resolution.ok ? { id: resolution.user.id } : null;
  }

  const supabase = await createClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id } : null;
}

async function loadPolls(planId: string) {
  const admin = await createAdminClient();
  const { data: polls, error } = await admin
    .from('polls')
    .select(
      'id, name, plan_id, created_at, creator_id, allow_anonymous_updates'
    )
    .eq('plan_id', planId);
  if (error || !polls?.length)
    return { polls: [], userVotes: [], guestVotes: [] };

  const { data: options } = await admin
    .from('poll_options')
    .select('id, poll_id, value, created_at')
    .in(
      'poll_id',
      polls.map((poll) => poll.id)
    );
  const optionIds = options?.map((option) => option.id) ?? [];
  const [userVotes, guestVotes] = optionIds.length
    ? await Promise.all([
        admin
          .from('poll_user_votes')
          .select(
            'id, option_id, user_id, created_at, users!users_poll_votes_user_id_fkey(display_name)'
          )
          .in('option_id', optionIds),
        admin
          .from('poll_guest_votes')
          .select(
            'id, option_id, guest_id, created_at, meet_together_guests!guest_poll_votes_guest_id_fkey(name)'
          )
          .in('option_id', optionIds),
      ])
    : [{ data: [] }, { data: [] }];

  const normalizedUserVotes = (userVotes.data ?? []).map((vote) => ({
    id: vote.id,
    option_id: vote.option_id,
    user_id: vote.user_id,
    created_at: vote.created_at,
    user: { display_name: vote.users?.display_name ?? '' },
  }));
  const normalizedGuestVotes = (guestVotes.data ?? []).map((vote) => ({
    id: vote.id,
    option_id: vote.option_id,
    guest_id: vote.guest_id,
    created_at: vote.created_at,
    guest: { display_name: vote.meet_together_guests?.name ?? '' },
  }));

  return {
    polls: polls.map((poll) => ({
      ...poll,
      options: (options ?? [])
        .filter((option) => option.poll_id === poll.id)
        .map((option) => {
          const optionUserVotes = normalizedUserVotes.filter(
            (vote) => vote.option_id === option.id
          );
          const optionGuestVotes = normalizedGuestVotes.filter(
            (vote) => vote.option_id === option.id
          );
          return {
            ...option,
            userVotes: optionUserVotes,
            guestVotes: optionGuestVotes,
            totalVotes: optionUserVotes.length + optionGuestVotes.length,
          };
        }),
    })),
    userVotes: normalizedUserVotes,
    guestVotes: normalizedGuestVotes,
  };
}

export async function loadMeetPlanSnapshot(
  request: NextRequest,
  rawPlanId: string,
  actor?: MeetActor | null
) {
  const resolvedActor =
    actor === undefined ? await resolveOptionalMeetActor(request) : actor;
  const planId = normalizeMeetTogetherPlanId(rawPlanId);
  const plan = await getPlan(planId, {
    actorUserId: resolvedActor?.id ?? null,
  });
  if (!plan?.id) return null;

  const admin = await createAdminClient();
  const finalizedQuery = fromUntyped(
    admin,
    'meet_together_finalized_timeframes'
  )
    .select('*')
    .eq('plan_id', planId)
    .order('position');
  const [usersResult, guestBlocks, userBlocks, finalizedResult, polls] =
    await Promise.all([
      admin
        .from('meet_together_users')
        .select('id:user_id, display_name, is_guest, timeblock_count')
        .eq('plan_id', planId),
      admin
        .from('meet_together_guest_timeblocks')
        .select('*')
        .eq('plan_id', planId),
      admin
        .from('meet_together_user_timeblocks')
        .select('*')
        .eq('plan_id', planId),
      finalizedQuery,
      loadPolls(planId),
    ]);

  if (
    usersResult.error ||
    guestBlocks.error ||
    userBlocks.error ||
    finalizedResult.error
  ) {
    throw new Error('Failed to load Tuturuuu Meet plan');
  }

  const users = (usersResult.data ?? []) as PlanUser[];
  const timeblocks = [
    ...(guestBlocks.data ?? []).map((block) => ({ ...block, is_guest: true })),
    ...(userBlocks.data ?? []).map((block) => ({ ...block, is_guest: false })),
  ] as Timeblock[];
  const finalizedTimeframes =
    finalizedResult.data as unknown as MeetFinalizedTimeframe[];
  const revisionParts = [
    plan.finalized_at,
    plan.created_at,
    ...timeblocks.map((block) => block.created_at),
    ...finalizedTimeframes.map((timeframe) => timeframe.updated_at),
  ].filter(Boolean);

  return {
    plan,
    users,
    timeblocks,
    finalizedTimeframes,
    polls,
    viewer: {
      id: resolvedActor?.id ?? null,
      isCreator: Boolean(
        resolvedActor?.id && resolvedActor.id === plan.creator_id
      ),
    },
    revision: revisionParts.sort().at(-1) ?? plan.id,
  };
}

interface UntypedRpcResult {
  data: unknown;
  error: { message: string } | null;
}

interface UntypedQueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

interface UntypedQueryBuilder extends PromiseLike<UntypedQueryResult> {
  select(columns: string): UntypedQueryBuilder;
  eq(column: string, value: unknown): UntypedQueryBuilder;
  order(column: string): UntypedQueryBuilder;
}

function fromUntyped(client: unknown, table: string) {
  return (client as { from(tableName: string): UntypedQueryBuilder }).from(
    table
  );
}

interface UntypedRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>
  ): PromiseLike<UntypedRpcResult>;
}

export async function callPrivateMeetRpc(
  name: string,
  args: Record<string, unknown>
) {
  const admin = await createAdminClient();
  const client = (
    admin as unknown as { schema(name: string): UntypedRpcClient }
  ).schema('private');
  return client.rpc(name, args);
}
