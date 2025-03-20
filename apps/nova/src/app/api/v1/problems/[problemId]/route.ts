import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    problemId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { problemId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: problem, error } = await supabase
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
  const supabase = await createClient();
  const { problemId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    title?: string;
    description?: string;
    maxPromptLength?: number;
    exampleInput?: string;
    exampleOutput?: string;
    challengeId?: string;
    testcases?: {
      input: string;
      output: string;
    }[];
  };

  try {
    body = await request.json();
  } catch (error) {
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

    delete body.testcases;

    const { data: updatedProblem, error: updateError } = await supabase
      .from('nova_problems')
      .update(body)
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

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { problemId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { error: deleteError } = await supabase
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
