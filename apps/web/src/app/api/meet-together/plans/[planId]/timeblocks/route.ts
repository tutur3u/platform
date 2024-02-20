import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    planId: string;
  };
}

export async function GET(_: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const guestTimeBlocksQuery = supabase
    .from('meet_together_guest_timeblocks')
    .select('*');

  const userTimeBlocksQuery = supabase
    .from('meet_together_user_timeblocks')
    .select('*');

  const [guestTimeBlocks, userTimeBlocks] = await Promise.all([
    guestTimeBlocksQuery,
    userTimeBlocksQuery,
  ]);

  const timeblocks = {
    guest: guestTimeBlocks.data,
    user: userTimeBlocks.data,
  };

  const errors = {
    guest: guestTimeBlocks.error,
    user: userTimeBlocks.error,
  };

  if (errors.guest || errors.user) {
    console.log(errors);
    return NextResponse.json(
      { message: 'Error fetching meet together timeblocks' },
      { status: 500 }
    );
  }

  return NextResponse.json(timeblocks);
}

export async function POST(req: Request, { params: { planId } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const guestId = data.guestId;
  const passwordHash = data.passwordHash;

  if (guestId && !passwordHash)
    return NextResponse.json(
      { message: 'Password hash required for guest timeblocks' },
      { status: 400 }
    );

  if (passwordHash && !guestId)
    return NextResponse.json(
      { message: 'Guest id required for password hash' },
      { status: 400 }
    );

  const userType = guestId ? 'guest' : 'user';

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (userType === 'user' && !user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const userId = userType === 'user' ? user?.id : guestId;

  const { data: plan, error } = await supabase
    .from(`meet_together_${userType}_timeblocks`)
    .insert({ ...data, plan_id: planId, user_id: userId })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating meet together plan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: plan.id, message: 'success' });
}
