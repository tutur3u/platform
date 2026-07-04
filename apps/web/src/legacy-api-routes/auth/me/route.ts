import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ user });
}
