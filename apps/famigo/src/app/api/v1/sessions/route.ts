import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createSessionSchema } from '../schemas';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get('challengeId');

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
      .from('nova_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (challengeId) {
      query = query.eq('challenge_id', challengeId);
    }

    const { data: sessions, error } = await query;

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching sessions' },
        { status: 500 }
      );
    }

    return NextResponse.json(sessions || [], { status: 200 });
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

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Validate request body with Zod
    const validatedData = createSessionSchema.parse(body);

    const sessionData = {
      start_time: validatedData.startTime,
      end_time: validatedData.endTime,
      status: validatedData.status,
      challenge_id: validatedData.challengeId,
      user_id: user.id,
    };

    const { data: session, error: sessionError } = await supabase
      .from('nova_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (sessionError) {
      console.error('Database Error: ', sessionError);
      return NextResponse.json(
        { message: 'Error creating session' },
        { status: 500 }
      );
    }

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      // Zod validation error
      return NextResponse.json(
        { message: 'Validation error', errors: error.errors },
        { status: 400 }
      );
    }

    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
