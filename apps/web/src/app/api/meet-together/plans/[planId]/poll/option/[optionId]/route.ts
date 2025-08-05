import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ planId: string; optionId: string }> }
) {
  const { planId, optionId } = await params;
  const { userType } = await req.json();
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  // Only platform users allowed to delete
  if (userType !== 'PLATFORM') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if plan is confirmed and deny option deletion
  const { data: plan } = await sbAdmin
    .from('meet_together_plans')
    .select('is_confirmed')
    .eq('id', planId)
    .single();

  if (plan?.is_confirmed) {
    return NextResponse.json(
      { message: 'Plan is confirmed. Deleting poll options is disabled.' },
      { status: 403 }
    );
  }

  // 1. Find poll_id for this option
  const { data: option, error: optionError } = await sbAdmin
    .from('poll_options')
    .select('poll_id')
    .eq('id', optionId)
    .single();

  if (optionError || !option) {
    return NextResponse.json(
      { message: 'Poll option not found' },
      { status: 404 }
    );
  }

  // 2. Find the poll to check creator
  const { data: poll, error: pollError } = await sbAdmin
    .from('polls')
    .select('creator_id, plan_id')
    .eq('id', option.poll_id)
    .single();

  if (pollError || !poll) {
    return NextResponse.json({ message: 'Poll not found' }, { status: 404 });
  }

  // 3. Check that user is the poll creator (and correct plan)
  if (poll.creator_id !== user.id || poll.plan_id !== planId) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  // 4. Delete the option (will cascade votes via FK)
  const { error: deleteError } = await sbAdmin
    .from('poll_options')
    .delete()
    .eq('id', optionId);

  if (deleteError) {
    return NextResponse.json(
      { message: 'Failed to delete option', error: deleteError },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Option deleted', optionId });
}
