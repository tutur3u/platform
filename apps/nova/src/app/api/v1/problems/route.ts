import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import { canManageNovaChallenge } from '@/lib/challenge-management-auth';
import { createProblemSchema } from '../schemas';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const challengeId = searchParams.get('challengeId');
  const includeChallenge = searchParams.get('includeChallenge') === 'true';

  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    // Build query with proper select statement based on params
    let selectQuery = '*';
    if (includeChallenge) {
      selectQuery = `
        *,
        nova_challenges (
          id,
          title
        )
      `;
    }

    let query = sbAdmin
      .schema('private')
      .from('nova_problems')
      .select(selectQuery)
      .order('created_at', { ascending: false });

    // Apply challenge filter if provided
    if (challengeId) {
      query = query.eq('challenge_id', challengeId);
    }

    console.log('Executing problems query with challengeId:', challengeId);
    const { data: problems, error } = await query;

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching problems' },
        { status: 500 }
      );
    }

    return NextResponse.json(problems, { status: 200 });
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
  let body: unknown;

  try {
    body = await request.json();
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Validate request body with Zod
    const validatedData = createProblemSchema.parse(body);
    const sbAdmin = await createAdminClient({ noCookie: true });

    if (
      !(await canManageNovaChallenge(user, validatedData.challengeId, sbAdmin))
    ) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const problemData = {
      title: validatedData.title,
      description: validatedData.description,
      max_prompt_length: validatedData.maxPromptLength,
      example_input: validatedData.exampleInput,
      example_output: validatedData.exampleOutput,
      challenge_id: validatedData.challengeId,
    };

    const { data: problem, error: problemError } = await sbAdmin
      .schema('private')
      .from('nova_problems')
      .insert(problemData)
      .select()
      .single();

    if (problemError) {
      console.error('Database Error: ', problemError);
      return NextResponse.json(
        { message: 'Error creating problem' },
        { status: 500 }
      );
    }

    return NextResponse.json(problem, { status: 201 });
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
