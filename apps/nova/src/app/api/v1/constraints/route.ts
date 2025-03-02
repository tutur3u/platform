import { createClient } from '@tuturuuu/supabase/next/server';
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

    let query = supabase.from('nova_problem_constraints').select('*');
    if (problemId) {
      query = query.eq('problem_id', problemId);
    }

    const { data: problemConstraints, error } = await query;

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching problem constraints' },
        { status: 500 }
      );
    }

    if (!problemConstraints?.length) {
      return NextResponse.json(
        { message: 'No problem constraints found' },
        { status: 404 }
      );
    }

    return NextResponse.json(problemConstraints, { status: 200 });
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
    if (!body.problem_id || !body.constraint_content) {
      return NextResponse.json(
        { message: 'problem_id and constraint_content are required' },
        { status: 400 }
      );
    }

    // Create the problem constraint
    const { data: problemConstraint, error: problemConstraintError } =
      await supabase
        .from('nova_problem_constraints')
        .insert({
          problem_id: body.problem_id,
          constraint_content: body.constraint_content,
        })
        .select()
        .single();

    if (problemConstraintError) {
      console.error('Database Error: ', problemConstraintError);
      return NextResponse.json(
        { message: 'Error creating problem constraint' },
        { status: 500 }
      );
    }

    return NextResponse.json(problemConstraint, { status: 201 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
