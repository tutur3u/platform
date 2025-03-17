import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    problemId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const criteriaId = searchParams.get('criteriaId');
  const { problemId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase
      .from('nova_problem_criteria_scores')
      .select('*')
      .eq('problem_id', problemId);

    if (criteriaId) {
      query = query.eq('criteria_id', criteriaId);
    }

    const { data: score, error } = await query;

    if (error) {
      console.error('Database Error:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Score not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching score' },
        { status: 500 }
      );
    }

    return NextResponse.json(score, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
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
    const body = await request.json();
    const { criteriaId, score } = body;

    if (!criteriaId || typeof score !== 'number') {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('nova_problem_criteria_scores')
      .upsert({
        problem_id: problemId,
        criteria_id: criteriaId,
        score: score,
      })
      .select()
      .single();

    if (error) {
      console.error('Database Error:', error);
      return NextResponse.json(
        { message: 'Error saving criteria score' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const criteriaId = searchParams.get('criteriaId');
  const { problemId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase
      .from('nova_problem_criteria_scores')
      .delete()
      .eq('problem_id', problemId);

    if (criteriaId) {
      query = query.eq('criteria_id', criteriaId);
    }

    const { error } = await query;

    if (error) {
      console.error('Database Error:', error);
      return NextResponse.json(
        { message: 'Error deleting score' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Score deleted successfully' },
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
