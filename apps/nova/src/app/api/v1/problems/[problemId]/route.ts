import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import {
  canManageNovaChallenge,
  getNovaProblemChallengeId,
} from '@/lib/challenge-management-auth';

interface Params {
  params: Promise<{
    problemId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { problemId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    const { data: problem, error } = await sbAdmin
      .schema('private')
      .from('nova_problems')
      .select('*')
      .eq('id', problemId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Problem not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching problem' },
        { status: 500 }
      );
    }

    return NextResponse.json(problem, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { problemId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  let body: {
    title?: string;
    description?: string;
    maxPromptLength?: number;
    exampleInput?: string;
    exampleOutput?: string;
    challengeId?: string;
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

    const { challengeId, error: lookupError } = await getNovaProblemChallengeId(
      problemId,
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

    if (
      body.challengeId &&
      body.challengeId !== challengeId &&
      !(await canManageNovaChallenge(user, body.challengeId, sbAdmin))
    ) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.maxPromptLength !== undefined) {
      if (body.maxPromptLength <= 0) {
        return NextResponse.json(
          { message: 'Max prompt length must be a positive number' },
          { status: 400 }
        );
      }
      updateData.max_prompt_length = body.maxPromptLength;
    }
    if (body.exampleInput !== undefined)
      updateData.example_input = body.exampleInput;
    if (body.exampleOutput !== undefined)
      updateData.example_output = body.exampleOutput;
    if (body.challengeId !== undefined)
      updateData.challenge_id = body.challengeId;

    const { data: updatedProblem, error: updateError } = await sbAdmin
      .schema('private')
      .from('nova_problems')
      .update(updateData)
      .eq('id', problemId)
      .select()
      .single();

    if (updateError) {
      console.error('Database Error: ', updateError);
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Problem not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error updating problem' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedProblem, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { problemId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    const { challengeId, error: lookupError } = await getNovaProblemChallengeId(
      problemId,
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

    const { error: deleteError } = await sbAdmin
      .schema('private')
      .from('nova_problems')
      .delete()
      .eq('id', problemId);

    if (deleteError) {
      console.error('Database Error: ', deleteError);
      return NextResponse.json(
        { message: 'Error deleting problem' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Problem deleted successfully' },
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
