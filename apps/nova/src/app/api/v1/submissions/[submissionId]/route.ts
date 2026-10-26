import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import { requireNovaSubmissionManager } from '@/lib/submission-access';

interface Params {
  params: Promise<{
    submissionId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createAdminClient({ noCookie: true });
  const { submissionId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: submission, error } = await supabase
      .schema('private')
      .from('nova_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Submission not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching submission' },
        { status: 500 }
      );
    }

    return NextResponse.json(submission, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createAdminClient({ noCookie: true });
  const { submissionId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    prompt?: unknown;
    problemId?: unknown;
    sessionId?: unknown;
  };

  try {
    body = await request.json();
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Submissions are bound to their problem and session when created
    // (checkPermission), so those links can never be rewritten afterwards.
    if (body.problemId !== undefined || body.sessionId !== undefined) {
      return NextResponse.json(
        { message: 'problemId and sessionId cannot be changed' },
        { status: 400 }
      );
    }

    if (typeof body.prompt !== 'string') {
      return NextResponse.json(
        { message: 'No update data provided' },
        { status: 400 }
      );
    }

    // Participants cannot edit a prompt after it was submitted and graded.
    const { response } = await requireNovaSubmissionManager(
      user,
      submissionId,
      supabase
    );

    if (response) return response;

    const { data: updatedSubmission, error: updateError } = await supabase
      .schema('private')
      .from('nova_submissions')
      .update({ prompt: body.prompt })
      .eq('id', submissionId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Database Error: ', updateError);
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Submission not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error updating submission' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedSubmission, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createAdminClient({ noCookie: true });
  const { submissionId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Deleting a submission would refund a session attempt, so participants
    // cannot delete their own submissions.
    const { response } = await requireNovaSubmissionManager(
      user,
      submissionId,
      supabase
    );

    if (response) return response;

    const { error: deleteError } = await supabase
      .schema('private')
      .from('nova_submissions')
      .delete()
      .eq('id', submissionId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Database Error: ', deleteError);
      return NextResponse.json(
        { message: 'Error deleting submission' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Submission deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
