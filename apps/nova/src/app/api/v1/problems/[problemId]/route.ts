import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    problemId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { problemId } = await params;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: problem, error } = await supabase
      .from('nova_problems')
      .select('*')
      .eq('id', problemId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching problem' },
        { status: 500 }
      );
    }

    if (!problem) {
      return NextResponse.json(
        { message: 'Problem not found' },
        { status: 404 }
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
  const supabase = await createClient();
  const { problemId } = await params;

  let body: {
    title: string;
    description: string;
    maxInputLength: number;
    exampleInput: string;
    exampleOutput: string;
    challengeId: string;
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
    if (!body.title || !body.challengeId) {
      return NextResponse.json(
        { message: 'Title and challengeId are required' },
        { status: 400 }
      );
    }

    if (typeof body.maxInputLength !== 'number' || body.maxInputLength <= 0) {
      return NextResponse.json(
        { message: 'Max input length must be a positive number' },
        { status: 400 }
      );
    }

    const { data: problem, error } = await supabase
      .from('nova_problems')
      .update({
        title: body.title,
        description: body.description,
        max_input_length: body.maxInputLength,
        example_input: body.exampleInput,
        example_output: body.exampleOutput,
        challenge_id: body.challengeId,
      })
      .eq('id', problemId)
      .select()
      .single();

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error updating problem' },
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

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { problemId } = await params;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('nova_problems')
      .delete()
      .eq('id', problemId);

    if (error) {
      console.error('Database Error: ', error);
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
