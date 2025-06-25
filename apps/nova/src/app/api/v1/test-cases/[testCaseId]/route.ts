import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    testCaseId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { testCaseId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: testcase, error } = await supabase
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
  const supabase = await createClient();
  const { testCaseId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

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

    const updateData: Record<string, unknown> = {};

    if (body.problemId !== undefined) updateData.problem_id = body.problemId;
    if (body.input !== undefined) updateData.input = body.input;
    if (body.output !== undefined) updateData.output = body.output;
    if (body.hidden !== undefined) updateData.hidden = body.hidden;

    const { data: updatedTestcase, error: updateError } = await supabase
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

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { testCaseId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { error: deleteError } = await supabase
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
