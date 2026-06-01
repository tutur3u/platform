import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import {
  canManageNovaChallenge,
  canManageNovaChallengesGlobally,
  getNovaProblemChallengeId,
} from '@/lib/challenge-management-auth';
import { createTestcaseSchema } from '../schemas';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const problemId = searchParams.get('problemId');
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    if (problemId) {
      const { challengeId, error: lookupError } =
        await getNovaProblemChallengeId(problemId, sbAdmin);

      if (lookupError) {
        console.error('Database Error: ', lookupError);
        return NextResponse.json(
          { message: 'Error fetching problem' },
          { status: 500 }
        );
      }

      if (!challengeId) {
        return NextResponse.json(
          { message: 'Problem not found' },
          { status: 404 }
        );
      }

      if (!(await canManageNovaChallenge(user, challengeId, sbAdmin))) {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }
    } else if (!(await canManageNovaChallengesGlobally(user, sbAdmin))) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    let query = sbAdmin
      .schema('private')
      .from('nova_problem_test_cases')
      .select('*');
    if (problemId) {
      query = query.eq('problem_id', problemId);
    }

    const { data: testCases, error } = await query;

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching test cases' },
        { status: 500 }
      );
    }

    return NextResponse.json(testCases, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Validate request body with Zod
    const validatedData = createTestcaseSchema.parse(body);
    const sbAdmin = await createAdminClient({ noCookie: true });
    const { challengeId, error: lookupError } = await getNovaProblemChallengeId(
      validatedData.problemId,
      sbAdmin
    );

    if (lookupError) {
      console.error('Database Error: ', lookupError);
      return NextResponse.json(
        { message: 'Error fetching problem' },
        { status: 500 }
      );
    }

    if (!challengeId) {
      return NextResponse.json(
        { message: 'Problem not found' },
        { status: 404 }
      );
    }

    if (!(await canManageNovaChallenge(user, challengeId, sbAdmin))) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const testcaseData = {
      problem_id: validatedData.problemId,
      input: validatedData.input,
      output: validatedData.output,
      hidden: validatedData.hidden,
    };

    const { data: testcase, error: testcaseError } = await sbAdmin
      .schema('private')
      .from('nova_problem_test_cases')
      .insert(testcaseData)
      .select()
      .single();

    if (testcaseError) {
      console.error('Database Error: ', testcaseError);
      return NextResponse.json(
        { message: 'Error creating testcase' },
        { status: 500 }
      );
    }

    return NextResponse.json(testcase, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      // Zod validation error
      return NextResponse.json(
        { message: 'Validation error', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
