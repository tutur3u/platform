import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createTestcaseSchema } from '../schemas';

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
    let query = supabase.from('nova_problem_test_cases').select('*');
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
      output: validatedData.output,
      hidden: validatedData.hidden,
    };

    const { data: testcase, error: testcaseError } = await supabase
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
