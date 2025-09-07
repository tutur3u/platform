import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    planId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const { planId } = await params;

  const guestTimeBlocksQuery = sbAdmin
    .from('meet_together_guest_timeblocks')
    .select('*')
    .eq('plan_id', planId);

  const userTimeBlocksQuery = sbAdmin
    .from('meet_together_user_timeblocks')
    .select('*')
    .eq('plan_id', planId);

  const [guestTimeBlocks, userTimeBlocks] = await Promise.all([
    guestTimeBlocksQuery,
    userTimeBlocksQuery,
  ]);

  const errors = {
    guest: guestTimeBlocks.error,
    user: userTimeBlocks.error,
  };

  if (errors.guest || errors.user) {
    return NextResponse.json(
      {
        message: 'Error fetching meet together timeblocks',
        errors,
      },
      { status: 500 }
    );
  }

  const timeblocks = [
    ...(guestTimeBlocks?.data || []).map((tb) => ({ ...tb, is_guest: true })),
    ...(userTimeBlocks?.data || []).map((tb) => ({ ...tb, is_guest: false })),
  ];

  return NextResponse.json(timeblocks);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { planId } = await params;

  const data = await req.json();

  const timeblocks =
    data.timeblocks || (data.timeblock ? [data.timeblock] : []); // Support both array and single timeblock for backward compatibility
  const passwordHash = data.password_hash;
  const userType = passwordHash ? 'guest' : 'user';

  if (!timeblocks || timeblocks.length === 0)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });

  // Check if plan is confirmed and deny timeblock creation
  const sbAdmin = await createAdminClient();
  const { data: plan } = await sbAdmin
    .from('meet_together_plans')
    .select('is_confirmed')
    .eq('id', planId)
    .single();

  if (plan?.is_confirmed) {
    return NextResponse.json(
      { message: 'Plan is confirmed. Adding availability is disabled.' },
      { status: 403 }
    );
  }

  // Clean up timeblocks - remove is_guest field and ensure they have required fields
  const cleanedTimeblocks = timeblocks.map((timeblock: Timeblock) => {
    const cleaned = { ...timeblock };
    delete cleaned.is_guest;
    return cleaned;
  });

  if (userType === 'user') {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const timeblocksToInsert = cleanedTimeblocks.map(
      (timeblock: Timeblock) => ({
        ...timeblock,
        plan_id: planId,
        user_id: user.id,
      })
    );

    const { data: insertedTimeblocks, error } = await supabase
      .from(`meet_together_user_timeblocks`)
      .insert(timeblocksToInsert)
      .select('id');

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error creating timeblocks' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ids: insertedTimeblocks?.map((tb) => tb.id) || [],
      message: 'success',
    });
  } else {
    const sbAdmin = await createAdminClient();

    const { data: guest } = await sbAdmin
      .from('meet_together_guests')
      .select('id')
      .eq('id', data.user_id)
      .eq('password_hash', passwordHash)
      .maybeSingle();

    if (!guest)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const timeblocksToInsert = cleanedTimeblocks.map(
      (timeblock: Timeblock) => ({
        ...timeblock,
        plan_id: planId,
        user_id: data.user_id,
      })
    );

    const { data: insertedTimeblocks, error } = await sbAdmin
      .from(`meet_together_guest_timeblocks`)
      .insert(timeblocksToInsert)
      .select('id');

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error creating timeblocks' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ids: insertedTimeblocks?.map((tb) => tb.id) || [],
      message: 'success',
    });
  }
}
