import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request) {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  const { planId, whereToMeet } = await req.json();

  // 1. Authenticate user (optional but recommended)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // 2. Update where_to_meet field
  const { data: updatedPlan, error: updateError } = await sbAdmin
    .from('meet_together_plans')
    .update({ where_to_meet: whereToMeet })
    .eq('id', planId)
    .select('id, where_to_meet')
    .single();

  if (updateError || !updatedPlan) {
    return NextResponse.json(
      { message: 'Error updating plan', error: updateError },
      { status: 500 }
    );
  }

  // 3. If enabling where_to_meet, ensure the "Where to Meet Poll" exists
  let pollId: string | null = null;
  if (whereToMeet) {
    // Try to find an existing poll for this plan with correct name
    const { data: poll, error: pollFetchError } = await sbAdmin
      .from('polls')
      .select('id')
      .eq('plan_id', planId)
      .eq('name', 'where')
      .maybeSingle();

    if (pollFetchError) {
      return NextResponse.json(
        { message: 'Error checking poll', error: pollFetchError },
        { status: 500 }
      );
    }

    if (poll?.id) {
      // Already exists, reuse
      pollId = poll.id;
    } else {
      // Not exist, create it
      const { data: newPoll, error: createPollError } = await sbAdmin
        .from('polls')
        .insert({
          plan_id: planId,
          creator_id: user.id,
          name: 'where',
        })
        .select('id')
        .single();

      if (createPollError) {
        return NextResponse.json(
          {
            message: 'Plan updated, but failed to create poll',
            error: createPollError,
          },
          { status: 200 }
        );
      }
      pollId = newPoll?.id;
    }
  }

  return NextResponse.json({
    id: planId,
    where_to_meet: updatedPlan.where_to_meet,
    pollId,
    message: 'Plan updated successfully',
  });
}
