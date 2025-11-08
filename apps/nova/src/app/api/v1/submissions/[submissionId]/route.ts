import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    submissionId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { submissionId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: submission, error } = await supabase
      .from('nova_submissions')
      .select('*')
      .eq('id', submissionId)
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
  const supabase = await createClient();
  const { submissionId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    prompt?: string;
    problemId?: string;
    sessionId?: string;
  };

  try {
    body = await request.json();
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Check if any update data was provided
    if (Object.keys(body).length === 0) {
      return NextResponse.json(
        { message: 'No update data provided' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (body.prompt !== undefined) updateData.prompt = body.prompt;
    if (body.problemId !== undefined) updateData.problem_id = body.problemId;
    if (body.sessionId !== undefined) updateData.session_id = body.sessionId;
    updateData.user_id = user.id;

    const { data: updatedSubmission, error: updateError } = await supabase
      .from('nova_submissions')
      .update(updateData)
      .eq('id', submissionId)
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

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { submissionId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { error: deleteError } = await supabase
      .from('nova_submissions')
      .delete()
      .eq('id', submissionId);

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
