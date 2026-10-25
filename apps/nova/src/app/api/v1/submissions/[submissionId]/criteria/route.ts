import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import { getNovaCriterionChallengeId } from '@/lib/challenge-management-auth';
import { requireNovaSubmissionManager } from '@/lib/submission-access';

interface Params {
  params: Promise<{
    submissionId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { submissionId } = await params;
  const { searchParams } = new URL(request.url);
  const criteriaId = searchParams.get('criteriaId');

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
      .from('nova_submission_criteria')
      .select('*')
      .eq('submission_id', submissionId);

    if (criteriaId) {
      query = query.eq('criteria_id', criteriaId);
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
    const { criteriaId, score, feedback } = body;

    if (
      typeof criteriaId !== 'string' ||
      !criteriaId ||
      typeof score !== 'number' ||
      typeof feedback !== 'string' ||
      !feedback
    ) {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { challengeId: criterionChallengeId, error: criterionError } =
      await getNovaCriterionChallengeId(criteriaId, sbAdmin);

    if (criterionError) {
      console.error('Database Error:', criterionError);
      return NextResponse.json(
        { message: 'Error fetching criterion' },
        { status: 500 }
      );
    }

    if (criterionChallengeId !== submission.challengeId) {
      return NextResponse.json(
        { message: 'Criterion does not belong to the submission challenge' },
        { status: 400 }
      );
    }

    const { data, error } = await sbAdmin
      .schema('private')
      .from('nova_submission_criteria')
      .upsert({
        submission_id: submission.id,
        criteria_id: criteriaId,
        score: score,
        feedback: feedback,
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
  const criteriaId = searchParams.get('criteriaId');

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
      .from('nova_submission_criteria')
      .delete()
      .eq('submission_id', submission.id);

    if (criteriaId) {
      query = query.eq('criteria_id', criteriaId);
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
