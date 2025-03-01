import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    constraintId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { constraintId } = await params;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: constraint, error } = await supabase
      .from('nova_problem_constraints')
      .select('*')
      .eq('id', constraintId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching problem constraint' },
        { status: 500 }
      );
    }

    if (!constraint) {
      return NextResponse.json(
        { message: 'Problem constraint not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(constraint, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createAdminClient();
  const { constraintId } = await params;
  const updates = await request.json();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Validate required fields
    if (!updates.problem_id || !updates.constraint_content) {
      return NextResponse.json(
        { message: 'problem_id and constraint_content are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('nova_problem_constraints')
      .update({
        problem_id: updates.problem_id,
        constraint_content: updates.constraint_content,
      })
      .eq('id', constraintId)
      .select()
      .single();

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error updating constraint' },
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
  const supabase = await createAdminClient();
  const { constraintId } = await params;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('nova_problem_constraints')
      .delete()
      .eq('id', constraintId);

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error deleting constraint' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Constraint deleted successfully' },
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
