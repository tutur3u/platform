// apps/web/src/app/api/meet-together/plans/[planId]/poll/route.ts
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

// POST: create a new poll for the plan
export async function POST(
  req: Request,
  { params }: { params: { planId: string } }
) {
  const { planId } = params;
  const { name, allow_anonymous_updates = false } = await req.json();

  // Auth: Only logged-in users can create polls
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if plan is confirmed and deny poll creation
  const sbAdmin = await createAdminClient();
  const { data: plan } = await sbAdmin
    .from('meet_together_plans')
    .select('is_confirm')
    .eq('id', planId)
    .single();

  if (plan?.is_confirm) {
    return NextResponse.json(
      { message: 'Plan is confirmed. Poll creation is disabled.' },
      { status: 403 }
    );
  }

  // Insert poll
  const { data: poll, error } = await sbAdmin
    .from('polls')
    .insert({
      name,
      plan_id: planId,
      creator_id: user.id,
      allow_anonymous_updates,
    })
    .select(
      'id, name, plan_id, creator_id, allow_anonymous_updates, created_at'
    )
    .single();

  if (error) {
    return NextResponse.json(
      { message: 'Failed to create poll', error },
      { status: 500 }
    );
  }

  return NextResponse.json({ poll, message: 'Poll created' });
}

export async function DELETE(
  req: Request,
  { params }: { params: { planId: string } }
) {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();
  const { planId } = params;
  const { pollId } = await req.json();

  try {
    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if plan is confirmed and deny poll deletion
    const { data: plan } = await sbAdmin
      .from('meet_together_plans')
      .select('is_confirm')
      .eq('id', planId)
      .single();

    if (plan?.is_confirm) {
      return NextResponse.json(
        { message: 'Plan is confirmed. Poll deletion is disabled.' },
        { status: 403 }
      );
    }

    // First, check if the poll exists and get its creator
    const { data: poll, error: pollError } = await sbAdmin
      .from('polls')
      .select('creator_id, plan_id, name')
      .eq('id', pollId)
      .single();

    if (pollError || !poll) {
      return NextResponse.json(
        { message: pollError?.message || 'Poll not found' },
        { status: 404 }
      );
    }

    // Verify the poll belongs to the specified plan
    if (poll.plan_id !== planId) {
      return NextResponse.json(
        { message: 'Poll does not belong to the specified plan' },
        { status: 400 }
      );
    }

    // Check if the current user is the creator of the poll
    if (poll.creator_id !== user.id) {
      return NextResponse.json(
        { message: 'Only the poll creator can delete this poll' },
        { status: 403 }
      );
    }

    // If this is the "Where to Meet?" poll, prevent deletion
    if (poll?.name === 'Where to Meet?') {
      return NextResponse.json(
        { message: 'Cannot delete the "Where to Meet?" poll' },
        { status: 403 }
      );
    }

    // Delete the poll and all related data (cascade deletion will handle the rest)
    const { error: deleteError } = await sbAdmin
      .from('polls')
      .delete()
      .eq('id', pollId);

    if (deleteError) {
      console.error('Error deleting poll:', deleteError);
      return NextResponse.json(
        { message: 'Error deleting poll' },
        { status: 500 }
      );
    }

    // The cascade deletion will automatically handle:
    // - poll_options (via foreign key constraint)
    // - poll_user_votes (via foreign key constraint)
    // - poll_guest_votes (via foreign key constraint)
    // - poll_user_permissions (via foreign key constraint)
    // - poll_guest_permissions (via foreign key constraint)

    return NextResponse.json({
      message: 'Poll deleted successfully',
      deletedPollId: pollId,
    });
  } catch (error) {
    console.error('Unexpected error deleting poll:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
