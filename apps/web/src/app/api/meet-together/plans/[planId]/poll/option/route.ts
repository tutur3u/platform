// /api/meet-together/poll/option.ts
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

  // Insert new poll option (open to both guests and users)
  const { data: option, error } = await sbAdmin
    .from('poll_options')
    .insert({
      poll_id: pollId,
      value,
    })
    .select('id')
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

  return NextResponse.json({
    message: 'Option added and voted',
    optionId: option.id,
  });
}
