import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });

  // Sign out of the current session
  // (local only, not from other devices)
  const { error } = await supabase.auth.signOut({
    scope: 'local',
  });

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 200 });
}
