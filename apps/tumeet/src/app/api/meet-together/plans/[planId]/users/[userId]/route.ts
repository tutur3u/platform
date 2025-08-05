import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    planId: string;
    userId: string;
  }>;
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient();
  const { planId, userId } = await params;

  // Check if the current user is the plan creator
  const { data: plan, error: planError } = await sbAdmin
    .from('meet_together_plans')
    .select('creator_id')
    .eq('id', planId)
    .single();

  if (planError || !plan) {
    return NextResponse.json({ message: 'Plan not found' }, { status: 404 });
  }

  if (plan.creator_id !== user.id) {
    return NextResponse.json(
      { message: 'Only the plan creator can remove users' },
      { status: 403 }
    );
  }

  // Prevent the creator from removing themselves
  if (userId === user.id) {
    return NextResponse.json(
      { message: 'Cannot remove yourself from the plan' },
      { status: 400 }
    );
  }

  try {
    // Delete user timeblocks
    const { error: timeblockError } = await sbAdmin
      .from('meet_together_user_timeblocks')
      .delete()
      .eq('plan_id', planId)
      .eq('user_id', userId);

    if (timeblockError) {
      return NextResponse.json(
        { message: 'Error removing user from plan' },
        { status: 500 }
      );
    }

    // Delete guest timeblocks for this user
    const { error: guestTimeblockError } = await sbAdmin
      .from('meet_together_guest_timeblocks')
      .delete()
      .eq('plan_id', planId)
      .eq('user_id', userId);

    if (guestTimeblockError) {
      return NextResponse.json(
        { message: 'Error removing user from plan' },
        { status: 500 }
      );
    }

    // Delete guest votes from polls for this user
    const { error: guestVoteError } = await sbAdmin
      .from('poll_guest_votes')
      .delete()
      .eq('guest_id', userId);

    if (guestVoteError) {
      return NextResponse.json(
        { message: 'Error removing user from plan' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'User removed from plan successfully',
    });
  } catch (error) {
    return NextResponse.json(
      { message: 'Error removing user from plan' },
      { status: 500 }
    );
  }
}
