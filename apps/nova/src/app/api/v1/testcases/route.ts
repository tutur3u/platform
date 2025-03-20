import { createTestcaseSchema } from '../schemas';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const problemId = searchParams.get('problemId');

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase.from('nova_problem_testcases').select('*');
    if (problemId) {
      query = query.eq('problem_id', problemId);
    }

    const { data: testcases, error } = await query;

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching testcases' },
        { status: 500 }
      );
    }

    return NextResponse.json(testcases, { status: 200 });
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

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Validate request body with Zod
    const validatedData = createTestcaseSchema.parse(body);

    const testcaseData = {
      problem_id: validatedData.problemId,
      input: validatedData.input,
    };

    const { data: testcase, error: testcaseError } = await supabase
      .from('nova_problem_testcases')
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

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const problemId = searchParams.get('problemId');

  if (!problemId) {
    return NextResponse.json(
      { message: 'Problem ID is required' },
      { status: 400 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const { data: testcase, error: testcaseError } = await supabase
      .from('nova_problem_testcases')
      .upsert({
        ...body,
        problem_id: problemId,
      })
      .select('id')
      .single();

    if (testcaseError) {
      console.error('Database Error: ', testcaseError);
      return NextResponse.json(
        { message: 'Error updating testcase' },
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

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const problemId = searchParams.get('problemId');

  if (!problemId) {
    return NextResponse.json(
      { message: 'Problem ID is required' },
      { status: 400 }
    );
  }

  try {
    const { data: testcases, error: testcasesError } = await supabase
      .from('nova_problem_testcases')
      .delete()
      .eq('problem_id', problemId);

    if (testcasesError) {
      console.error('Database Error: ', testcasesError);
      return NextResponse.json(
        { message: 'Error deleting testcases' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Testcases deleted' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
