import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  if (!user.email?.endsWith('@tuturuuu.com')) {
    return NextResponse.json(
      { message: 'Unauthorized email domain' },
      { status: 403 }
    );
  }

  const res = await fetch(`${process.env.AURORA_EXTERNAL_URL}/health`);

  if (!res.ok) {
    return NextResponse.json(
      { message: 'Error fetching health' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Success' });
}
