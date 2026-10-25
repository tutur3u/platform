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
  const { submissionId } = await params;
  const { searchParams } = new URL(request.url);
  const testCaseId = searchParams.get('testCaseId');

  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    // Check if submission belongs to user
    const { error: submissionError } = await sbAdmin
      .schema('private')
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
      .schema('private')
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

  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    // Grades feed scores and leaderboards, so only challenge managers write them.
    const { response, submission } = await requireNovaSubmissionManager(
      user,
      submissionId,
      sbAdmin
    );

    if (response) return response;

    const body = await request.json();
    const { testCaseId, output, matched } = body;

    if (
      typeof testCaseId !== 'string' ||
      !testCaseId ||
      typeof output !== 'string' ||
      typeof matched !== 'boolean'
    ) {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { data: testCase, error: testCaseError } = await sbAdmin
      .schema('private')
      .from('nova_problem_test_cases')
      .select('problem_id')
      .eq('id', testCaseId)
      .maybeSingle();

    if (testCaseError) {
      console.error('Database Error:', testCaseError);
      return NextResponse.json(
        { message: 'Error fetching test case' },
        { status: 500 }
      );
    }

    if (testCase?.problem_id !== submission.problemId) {
      return NextResponse.json(
        { message: 'Test case does not belong to the submission problem' },
        { status: 400 }
      );
    }

    const { data, error } = await sbAdmin
      .schema('private')
      .from('nova_submission_test_cases')
      .upsert({
        submission_id: submission.id,
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

  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    const { response, submission } = await requireNovaSubmissionManager(
      user,
      submissionId,
      sbAdmin
    );

    if (response) return response;

    let query = sbAdmin
      .schema('private')
      .from('nova_submission_test_cases')
      .delete()
      .eq('submission_id', submission.id);

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
