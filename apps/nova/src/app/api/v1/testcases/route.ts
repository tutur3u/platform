import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(request.url);
  const problemId = searchParams.get('problemId');

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    let query = supabase.from('nova_problem_testcases').select('*');
    if (problemId) {
      query = query.eq('problem_id', problemId);
    }

    const { data: problemTestcases, error } = await query;

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching problem testcases' },
        { status: 500 }
      );
    }

    if (!problemTestcases?.length) {
      return NextResponse.json(
        { message: 'No problem testcases found' },
        { status: 404 }
      );
    }

    return NextResponse.json(problemTestcases, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createAdminClient();
  const body = await request.json();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Validate required fields
    if (!body.problem_id || !body.testcase_content) {
      return NextResponse.json(
        { message: 'problem_id and testcase_content are required' },
        { status: 400 }
      );
    }

    // Create the problem testcase
    const { data: problemTestcase, error: problemTestcaseError } =
      await supabase
        .from('nova_problem_testcases')
        .insert({
          problem_id: body.problem_id,
          testcase_content: body.testcase_content,
        })
        .select()
        .single();

    if (problemTestcaseError) {
      console.error('Database Error: ', problemTestcaseError);
      return NextResponse.json(
        { message: 'Error creating problem testcase' },
        { status: 500 }
      );
    }

    return NextResponse.json(problemTestcase, { status: 201 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
