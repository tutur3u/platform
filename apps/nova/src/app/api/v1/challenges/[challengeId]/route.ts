import { createClient } from '@tuturuuu/supabase/next/server';
import type { NovaChallengeCriteria } from '@tuturuuu/types/db';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    challengeId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { challengeId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: challenge, error } = await supabase
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Challenge not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching challenge' },
        { status: 500 }
      );
    }

    return NextResponse.json(challenge, { status: 200 });
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
  const { challengeId } = await params;

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

    // Check if any update data was provided
    if (Object.keys(body).length === 0) {
      return NextResponse.json(
        { message: 'No update data provided' },
        { status: 400 }
      );
    }
  } catch (error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const updateData: any = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.duration !== undefined) {
      if (body.duration <= 0) {
        return NextResponse.json(
          { message: 'Duration must be a positive number' },
          { status: 400 }
        );
      }
      updateData.duration = body.duration;
    }
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.previewable_at !== undefined)
      updateData.previewable_at = body.previewable_at;
    if (body.open_at !== undefined) updateData.open_at = body.open_at;
    if (body.close_at !== undefined) updateData.close_at = body.close_at;

    const { data: updatedChallenge, error: updateError } = await supabase
      .from('nova_challenges')
      .update(updateData)
      .eq('id', challengeId)
      .select()
      .single();

    if (updateError) {
      console.error('Database Error: ', updateError);
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Challenge not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error updating challenge' },
        { status: 500 }
      );
    }

    if (body.criteria) {
      const { error: updateCriteriaError } = await supabase
        .from('nova_challenge_criteria')
        .delete()
        .eq('challenge_id', challengeId);

      if (updateCriteriaError) {
        console.error('Database Error: ', updateCriteriaError);
        return NextResponse.json(
          { message: 'Error updating challenge criteria' },
          { status: 500 }
        );
      }

      const { error: newCriteriaError } = await supabase
        .from('nova_challenge_criteria')
        .insert(
          body.criteria.map((criterion: NovaChallengeCriteria) => ({
            ...criterion,
            challenge_id: challengeId,
          }))
        );

      if (newCriteriaError) {
        console.error('Database Error: ', newCriteriaError);
        return NextResponse.json(
          { message: 'Error creating challenge criteria' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(updatedChallenge, { status: 200 });
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
  const { challengeId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { error: deleteError } = await supabase
      .from('nova_challenges')
      .delete()
      .eq('id', challengeId);

    if (deleteError) {
      console.error('Database Error: ', deleteError);
      return NextResponse.json(
        { message: 'Error deleting challenge' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Challenge deleted successfully' },
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
