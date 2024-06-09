import { createAdminClient } from '@/utils/supabase/client';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    planId: string;
  };
}

export async function GET(_: Request) {
  const sbAdmin = createAdminClient();
  if (!sbAdmin)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );

  const guestTimeBlocksQuery = sbAdmin
    .from('meet_together_guest_timeblocks')
    .select('*');

  const userTimeBlocksQuery = sbAdmin
    .from('meet_together_user_timeblocks')
    .select('*');

  const [guestTimeBlocks, userTimeBlocks] = await Promise.all([
    guestTimeBlocksQuery,
    userTimeBlocksQuery,
  ]);

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

  const timeblocks = [
    ...(guestTimeBlocks?.data || [])?.map((tb) => ({ ...tb, is_guest: true })),
    ...(userTimeBlocks?.data || [])?.map((tb) => ({ ...tb, is_guest: false })),
  ];

  return NextResponse.json(timeblocks);
}

export async function POST(req: Request, { params: { planId } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const timeblock = data.timeblock;
  delete timeblock.is_guest;

  const passwordHash = data.password_hash;
  const userType = passwordHash ? 'guest' : 'user';

  if (!timeblock)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });

  if (userType === 'user') {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { data: tb, error } = await supabase
      .from(`meet_together_user_timeblocks`)
      .insert({ ...timeblock, plan_id: planId, user_id: user?.id })
      .select('id')
      .single();

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error creating timeblock' },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: tb.id, message: 'success' });
  } else {
    const sbAdmin = createAdminClient();
    if (!sbAdmin)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );

    const { data: guest } = await sbAdmin
      .from('meet_together_guests')
      .select('id')
      .eq('id', data.user_id)
      .eq('password_hash', passwordHash)
      .maybeSingle();

    if (!guest)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { data: tb, error } = await sbAdmin
      .from(`meet_together_guest_timeblocks`)
      .insert({ ...timeblock, plan_id: planId, user_id: data.user_id })
      .select('id')
      .single();

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error creating timeblock' },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: tb.id, message: 'success' });
  }
}
