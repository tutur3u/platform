import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    submissionId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { submissionId } = await params;
  const { searchParams } = new URL(request.url);
  const testCaseId = searchParams.get('testCaseId');

  const supabase = await createAdminClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient();

  try {
    // Check if submission belongs to user
    const { error: submissionError } = await sbAdmin
      .from('nova_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('user_id', user.id)
      .single();

    if (submissionError) {
      console.error('Database Error:', submissionError);
      return NextResponse.json(
        { message: 'Error fetching submission' },
        { status: 500 }
      );
    }

    let query = sbAdmin
      .from('nova_submission_test_cases')
      .select('*')
      .eq('submission_id', submissionId);

    if (testCaseId) {
      query = query.eq('test_case_id', testCaseId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database Error:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Record not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching record' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { submissionId } = await params;

  const supabase = await createAdminClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient();

  try {
    const body = await request.json();
    const { testCaseId, output, matched } = body;

    if (
      !testCaseId ||
      typeof output !== 'string' ||
      typeof matched !== 'boolean'
    ) {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Check if submission belongs to user
    const { error: submissionError } = await sbAdmin
      .from('nova_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('user_id', user.id)
      .single();

    if (submissionError) {
      console.error('Database Error:', submissionError);
      return NextResponse.json(
        { message: 'Error fetching submission' },
        { status: 500 }
      );
    }

    const { data, error } = await sbAdmin
      .from('nova_submission_test_cases')
      .upsert({
        submission_id: submissionId,
        test_case_id: testCaseId,
        output: output,
        matched: matched,
      })
      .select()
      .single();

    if (error) {
      console.error('Database Error:', error);
      return NextResponse.json(
        { message: 'Error saving record' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { submissionId } = await params;
  const { searchParams } = new URL(request.url);
  const testCaseId = searchParams.get('testCaseId');

  const supabase = await createAdminClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase
      .from('nova_submission_test_cases')
      .delete()
      .eq('submission_id', submissionId);

    if (testCaseId) {
      query = query.eq('test_case_id', testCaseId);
    }

    const { error } = await query;

    if (error) {
      console.error('Database Error:', error);
      return NextResponse.json(
        { message: 'Error deleting record' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Record deleted successfully' },
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
