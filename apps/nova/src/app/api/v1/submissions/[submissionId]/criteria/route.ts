import { createAdminClient, createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    submissionId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { submissionId } = await params;
  const { searchParams } = new URL(request.url);
  const criteriaId = searchParams.get('criteriaId');

  const supabase = await createClient();

  

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  console.log('GET /criteria: user', user);
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase
      .from('nova_submission_criteria')
      .select('*')
      .eq('submission_id', submissionId);

    if (criteriaId) {
      query = query.eq('criteria_id', criteriaId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database Error:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Record not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching record' },
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

export async function PUT(request: Request, { params }: Params) {
  const { submissionId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  console.log('PUT /criteria: user', user);

  if (authError || !user?.id) {
    console.log('PUT /criteria: Unauthorized', authError);
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { criteriaId, score, feedback } = body;

    console.log('PUT /criteria: request body', body);
    if (!criteriaId || typeof score !== 'number' || !feedback) {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('nova_submission_criteria')
      .upsert({
        submission_id: submissionId,
        criteria_id: criteriaId,
        score: score,
        feedback: feedback,
      })
      .select()
      .single();

    console.log('PUT /criteria: upsert result', { data, error });
    if (error) {
      console.error('Database Error:', error);
      return NextResponse.json(
        { message: 'Error saving record' },
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
  const { submissionId } = await params;
  const { searchParams } = new URL(request.url);
  const criteriaId = searchParams.get('criteriaId');

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase
      .from('nova_submission_criteria')
      .delete()
      .eq('submission_id', submissionId);

    if (criteriaId) {
      query = query.eq('criteria_id', criteriaId);
    }

    const { error } = await query;

    if (error) {
      console.error('Database Error:', error);
      return NextResponse.json(
        { message: 'Error deleting record' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Record deleted successfully' },
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
