import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(_: Request) {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.from('nova_challenges').select('*');

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching challenges' },
        { status: 500 }
      );
    }

    if (!data?.length) {
      return NextResponse.json(
        { message: 'No challenges found' },
        { status: 404 }
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

export async function POST(request: Request) {
  const supabase = await createClient();

  let body: {
    title: string;
    description: string;
    criteria: Array<{ name: string; description: string }>;
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

    // Begin a transaction by using the Supabase client
    // First create the challenge
    const { data: challengeData, error: challengeError } = await supabase
      .from('nova_challenges')
      .insert({
        title: body.title,
        description: body.description,
        duration: body.duration,
        enabled: false,
      })
      .select()
      .single();

    if (challengeError) {
      console.error('Database Error when creating challenge:', challengeError);
      return NextResponse.json(
        { message: 'Error creating challenge' },
        { status: 500 }
      );
    }
    // console.log(body)
    if (
      body.criteria &&
      Array.isArray(body.criteria) &&
      body.criteria.length > 0
    ) {
      const criteriaToInsert = body.criteria.map((criterion) => ({
        challenge_id: challengeData.id,
        name: criterion.name,
        value: criterion.description,
      }));
      console.log(criteriaToInsert);
      const { error: criteriaError } = await supabase
        .from('nova_challenge_criterias')
        .insert(criteriaToInsert)
        .select();

      if (criteriaError) {
        console.error('Database Error when creating criteria:', criteriaError);
        return NextResponse.json(
          { message: 'Error creating criteria', error: criteriaError },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(challengeData, { status: 201 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
