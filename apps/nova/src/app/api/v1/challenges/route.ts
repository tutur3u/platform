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
      .insert({
        title: body.title,
        description: body.description,
        duration: body.duration,
        enabled: false,
      })
      .select()
      .single();
      

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error creating challenge' },
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
