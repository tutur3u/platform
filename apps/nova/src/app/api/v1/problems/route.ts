import { createProblemSchema } from '../schemas';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get('challengeId');

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase.from('nova_problems').select('*');
    if (challengeId) {
      query = query.eq('challenge_id', challengeId);
    }

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
  const supabase = await createClient();
  let body;

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Validate request body with Zod
    const validatedData = createProblemSchema.parse(body);

    const problemData = {
      title: validatedData.title,
      description: validatedData.description,
      max_prompt_length: validatedData.maxPromptLength,
      example_input: validatedData.exampleInput,
      example_output: validatedData.exampleOutput,
      challenge_id: validatedData.challengeId,
    };

    const { data: problem, error: problemError } = await supabase
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
        { message: 'Validation error', errors: error.errors },
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
