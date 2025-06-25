import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
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

  let body: { challengeId?: string; password?: string };

  try {
    body = await request.json();
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const sbAdmin = await createAdminClient();

  try {
    const { challengeId, password } = body;

    if (!challengeId || !password) {
      return NextResponse.json(
        {
          message: 'Missing required fields: challengeId and password',
        },
        { status: 400 }
      );
    }

    const { data: challenge, error } = await sbAdmin
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
    const passwordHash = await hashPassword(password, passwordSalt);

    if (challenge.password_hash !== passwordHash) {
      return NextResponse.json(
        { message: 'Invalid password' },
        { status: 401 }
      );
    }

    const response = NextResponse.json(
      { message: 'Password verified successfully' },
      { status: 200 }
    );
    response.cookies.set('token', passwordHash, {
      httpOnly: true,
      secure: true,
      maxAge: challenge.duration,
    });

    return response;
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
