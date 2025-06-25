import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    criterionId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { criterionId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: criterion, error } = await supabase
      .from('nova_challenge_criteria')
      .select('*')
      .eq('id', criterionId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Criterion not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching criterion' },
        { status: 500 }
      );
    }

    return NextResponse.json(criterion, { status: 200 });
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
  const { criterionId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    name?: string;
    description?: string;
    challengeId?: string;
  };

  try {
    body = await request.json();

    // Check if any update data was provided
    if (Object.keys(body).length === 0) {
      return NextResponse.json(
        { message: 'No update data provided' },
        { status: 400 }
      );
    }
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.challengeId !== undefined)
      updateData.challenge_id = body.challengeId;

    const { data: updatedCriterion, error: updateError } = await supabase
      .from('nova_challenge_criteria')
      .update(updateData)
      .eq('id', criterionId)
      .select()
      .single();

    if (updateError) {
      console.error('Database Error: ', updateError);
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Criterion not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error updating criterion' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedCriterion, { status: 200 });
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
  const { criterionId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { error: deleteError } = await supabase
      .from('nova_challenge_criteria')
      .delete()
      .eq('id', criterionId);

    if (deleteError) {
      console.error('Database Error: ', deleteError);
      return NextResponse.json(
        { message: 'Error deleting criterion' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Criterion deleted successfully' },
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
