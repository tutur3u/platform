import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { pollId, value, userType, guestId } = await req.json();
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  let userId: string | null = null;
  if (userType === 'PLATFORM') {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    if (!userId)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if plan is confirmed with a single JOIN query
  const { data: pollWithPlan } = await sbAdmin
    .from('polls')
    .select('meet_together_plans!inner(is_confirmed)')
    .eq('id', pollId)
    .single();

  if (pollWithPlan?.meet_together_plans?.is_confirmed) {
    return NextResponse.json(
      { message: 'Plan is confirmed. Adding poll options is disabled.' },
      { status: 403 }
    );
  }

  // Insert new poll option (open to both guests and users)
  const { data: option, error } = await sbAdmin
    .from('poll_options')
    .insert({
      poll_id: pollId,
      value,
    })
    .select('id, poll_id, value, created_at')
    .single();

  if (error) {
    return NextResponse.json(
      { message: 'Failed to add option', error },
      { status: 500 }
    );
  }

  //   Optionally: Auto-vote for the new option
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

  // Fetch votes for the new option with user/guest information
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

  // Transform the data to match the expected types
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

  return NextResponse.json({
    message: 'Option added and voted',
    option: {
      ...option,
      userVotes: transformedUserVotes,
      guestVotes: transformedGuestVotes,
      totalVotes,
    },
  });
}
