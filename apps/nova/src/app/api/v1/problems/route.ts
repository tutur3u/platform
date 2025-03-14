import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get('challengeId');

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

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

    if (!problems?.length) {
      return NextResponse.json(
        { message: 'No problems found' },
        { status: 404 }
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
  let body: {
    title: string;
    challengeId: string;
    description: string;
    maxPromptLength: number;
    exampleInput: string;
    exampleOutput: string;
  };
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Validate required fields
    if (
      !body.title ||
      !body.challengeId ||
      !body.description ||
      !body.maxPromptLength ||
      !body.exampleInput ||
      !body.exampleOutput
    ) {
      return NextResponse.json(
        {
          message:
            'Title, challengeId, description, maxPromptLength, exampleInput, and exampleOutput are required',
        },
        { status: 400 }
      );
    }

    if (typeof body.maxPromptLength !== 'number' || body.maxPromptLength <= 0) {
      return NextResponse.json(
        { message: 'Max prompt length must be a positive number' },
        { status: 400 }
      );
    }

    const { data: problem, error: problemError } = await supabase
      .from('nova_problems')
      .insert({
        title: body.title,
        description: body.description,
        max_prompt_length: body.maxPromptLength,
        example_input: body.exampleInput,
        example_output: body.exampleOutput,
        challenge_id: body.challengeId,
      })
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
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
