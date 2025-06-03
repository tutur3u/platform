import { createClient } from '@ncthub/supabase/next/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const supabaseCookies = cookieStore
    .getAll()
    .filter(({ name }) => name.startsWith('sb-'))
    .map(({ name, value }) => ({ name, value }));

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return NextResponse.json({
    cookies: supabaseCookies,
    session,
  });
}
