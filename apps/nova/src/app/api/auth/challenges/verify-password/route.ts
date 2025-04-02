import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();

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
  } catch (error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const { challengeId, password_hash } = body;

    if (!challengeId || !password_hash) {
      return NextResponse.json(
        { message: 'Missing required fields: challengeId and password_hash' },
        { status: 400 }
      );
    }

    const { data: challenge, error } = await supabase
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (error || !challenge) {
      return NextResponse.json(
        { message: 'Challenge not found' },
        { status: 404 }
      );
    }

    if (!challenge.password_hash) {
      return NextResponse.json(
        { message: 'Challenge has no password' },
        { status: 400 }
      );
    }

    // Verify if the provided password hash matches what's stored
    if (challenge.password_hash !== password_hash) {
      return NextResponse.json(
        { message: 'Invalid password' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { message: 'Password verified successfully' },
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
