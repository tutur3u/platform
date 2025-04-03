import { createClient } from '@tuturuuu/supabase/next/server';
import { generateSalt, hashPassword } from '@tuturuuu/utils/crypto';
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
    const { challengeId, password, token } = body;

    if (!challengeId || (!password && !token)) {
      return NextResponse.json(
        {
          message: 'Missing required fields: challengeId and password or token',
        },
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

    // Hash the provided password and compare with stored hash
    const passwordSalt = challenge.password_salt || generateSalt();
    const passwordHash = password
      ? await hashPassword(password, passwordSalt)
      : token;

    if (challenge.password_hash !== passwordHash) {
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
