import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    testcaseId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { testcaseId } = await params;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: testcase, error } = await supabase
      .from('nova_problem_testcases')
      .select('*')
      .eq('id', testcaseId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching testcase' },
        { status: 500 }
      );
    }

    if (!testcase) {
      return NextResponse.json(
        { message: 'Testcase not found' },
        { status: 404 }
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
  const { testcaseId } = await params;

  let body: {
    problemId: string;
    input: string;
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
    if (!body.problemId || !body.input) {
      return NextResponse.json(
        { message: 'problemId and input are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('nova_problem_testcases')
      .update({
        problem_id: body.problemId,
        input: body.input,
      })
      .eq('id', testcaseId)
      .select()
      .single();

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error updating testcase' },
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

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { testcaseId } = await params;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('nova_problem_testcases')
      .delete()
      .eq('id', testcaseId);

    if (error) {
      console.error('Database Error: ', error);
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
