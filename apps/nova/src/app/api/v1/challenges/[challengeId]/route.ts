import { createClient } from '@tuturuuu/supabase/next/server';
import type { NovaChallengeCriteria } from '@tuturuuu/types/db';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    challengeId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { challengeId } = await params;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: challenge, error } = await supabase
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching challenge' },
        { status: 500 }
      );
    }

    if (!challenge) {
      return NextResponse.json(
        { message: 'Challenge not found' },
        { status: 404 }
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

  let body: {
    title: string;
    criteria: NovaChallengeCriteria[];
    description: string;
    duration: number;
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
    if (!body.title || !body.description || body.duration === undefined) {
      return NextResponse.json(
        { message: 'Title, description, and duration are required' },
        { status: 400 }
      );
    }

    if (typeof body.duration !== 'number' || body.duration <= 0) {
      return NextResponse.json(
        { message: 'Duration must be a positive number' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('nova_challenges')
      .update({
        title: body.title,
        description: body.description,
        duration: body.duration,
      })
      .eq('id', challengeId)
      .select()
      .single();

    if (error) {
      console.error('[nova_challenges] Database Error: ', error);
      return NextResponse.json(
        { message: 'Error updating challenge' },
        { status: 500 }
      );
    }

    const { error: criteriaError } = await supabase
      .from('nova_challenge_criteria')
      .delete()
      .eq('challenge_id', challengeId);

    if (criteriaError) {
      console.error(
        '[nova_challenge_criteria] Database Error: ',
        criteriaError
      );
      return NextResponse.json(
        { message: 'Error deleting criteria' },
        { status: 500 }
      );
    }

    const { error: newCriteriaError } = await supabase
      .from('nova_challenge_criteria')
      .insert(
        body.criteria.map((criterion) => ({
          ...criterion,
          challenge_id: data.id,
        }))
      );

    if (newCriteriaError) {
      console.error(
        '[nova_challenge_criteria] Database Error: ',
        newCriteriaError
      );
      return NextResponse.json(
        { message: 'Error deleting criteria' },
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
  const { challengeId } = await params;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('nova_challenges')
      .delete()
      .eq('id', challengeId);

    if (error) {
      console.error('Database Error: ', error);
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
