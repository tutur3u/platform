import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient(request);
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url));
}

export async function GET(request: NextRequest) {
  const supabase = await createClient(request);
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url));
}
