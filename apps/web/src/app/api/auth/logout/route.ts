import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase.auth.signOut();
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 200 });
}
