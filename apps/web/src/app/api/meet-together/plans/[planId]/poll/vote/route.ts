// /api/meet-together/poll/vote.ts
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { pollId, optionIds, userType, guestId } = await req.json();
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  let userId: string | null = null;

  // Get user id if platform user
  if (userType === 'PLATFORM') {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    if (!userId)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Remove previous votes for this poll (for this user/guest)
  // 1. Find all options for this poll
  const { data: pollOptions } = await sbAdmin
    .from('poll_options')
    .select('id')
    .eq('poll_id', pollId);

  const pollOptionIds = pollOptions?.map((o) => o.id) ?? [];

  // 2. Delete previous votes
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

  // 3. Insert new votes
  if (userType === 'PLATFORM' && userId) {
    const toInsert = optionIds.map((option_id: string) => ({
      user_id: userId,
      option_id,
    }));
    if (toInsert.length > 0) {
      await sbAdmin.from('poll_user_votes').insert(toInsert);
    }
  } else if (userType === 'GUEST' && guestId) {
    const toInsert = optionIds.map((option_id: string) => ({
      guest_id: guestId,
      option_id,
    }));
    if (toInsert.length > 0) {
      await sbAdmin.from('poll_guest_votes').insert(toInsert);
    }
  } else {
    return NextResponse.json(
      { message: 'Invalid vote request' },
      { status: 400 }
    );
  }

  return NextResponse.json({ message: 'Vote submitted' });
}
