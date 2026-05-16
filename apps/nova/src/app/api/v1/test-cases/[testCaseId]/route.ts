import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import {
  canManageNovaChallenge,
  getNovaProblemChallengeId,
  getNovaTestCaseChallengeId,
} from '@/lib/challenge-management-auth';

interface Params {
  params: Promise<{
    testCaseId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { testCaseId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    const { challengeId, error: lookupError } =
      await getNovaTestCaseChallengeId(testCaseId, sbAdmin);

    if (lookupError) {
      console.error('Database Error: ', lookupError);
      return NextResponse.json(
        { message: 'Error fetching testcase' },
        { status: 500 }
      );
    }

    if (!challengeId) {
      return NextResponse.json(
        { message: 'Testcase not found' },
        { status: 404 }
      );
    }

    if (!(await canManageNovaChallenge(user, challengeId, sbAdmin))) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { data: testcase, error } = await sbAdmin
      .from('nova_problem_test_cases')
      .select('*')
      .eq('id', testCaseId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Testcase not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching testcase' },
        { status: 500 }
      );
    }

    return NextResponse.json(testcase, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { testCaseId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  let body: {
    problemId?: string;
    input?: string;
    output?: string;
    hidden?: boolean;
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

    const { challengeId, error: lookupError } =
      await getNovaTestCaseChallengeId(testCaseId, sbAdmin);

    if (lookupError) {
      console.error('Database Error: ', lookupError);
      return NextResponse.json(
        { message: 'Error fetching testcase' },
        { status: 500 }
      );
    }

    if (!challengeId) {
      return NextResponse.json(
        { message: 'Testcase not found' },
        { status: 404 }
      );
    }

    if (!(await canManageNovaChallenge(user, challengeId, sbAdmin))) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    if (body.problemId) {
      const { challengeId: targetChallengeId, error: targetLookupError } =
        await getNovaProblemChallengeId(body.problemId, sbAdmin);

      if (targetLookupError) {
        console.error('Database Error: ', targetLookupError);
        return NextResponse.json(
          { message: 'Error fetching problem' },
          { status: 500 }
        );
      }

      if (!targetChallengeId) {
        return NextResponse.json(
          { message: 'Problem not found' },
          { status: 404 }
        );
      }

      if (
        targetChallengeId !== challengeId &&
        !(await canManageNovaChallenge(user, targetChallengeId, sbAdmin))
      ) {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }
    }

    const updateData: any = {};

    if (body.problemId !== undefined) updateData.problem_id = body.problemId;
    if (body.input !== undefined) updateData.input = body.input;
    if (body.output !== undefined) updateData.output = body.output;
    if (body.hidden !== undefined) updateData.hidden = body.hidden;

    const { data: updatedTestcase, error: updateError } = await sbAdmin
      .from('nova_problem_test_cases')
      .update(updateData)
      .eq('id', testCaseId)
      .select()
      .single();

    if (updateError) {
      console.error('Database Error: ', updateError);
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Testcase not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error updating testcase' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedTestcase, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { testCaseId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    const { challengeId, error: lookupError } =
      await getNovaTestCaseChallengeId(testCaseId, sbAdmin);

    if (lookupError) {
      console.error('Database Error: ', lookupError);
      return NextResponse.json(
        { message: 'Error fetching testcase' },
        { status: 500 }
      );
    }

    if (!challengeId) {
      return NextResponse.json(
        { message: 'Testcase not found' },
        { status: 404 }
      );
    }

    if (!(await canManageNovaChallenge(user, challengeId, sbAdmin))) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { error: deleteError } = await sbAdmin
      .from('nova_problem_test_cases')
      .delete()
      .eq('id', testCaseId);

    if (deleteError) {
      console.error('Database Error: ', deleteError);
      return NextResponse.json(
        { message: 'Error deleting testcase' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Testcase deleted successfully' },
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
