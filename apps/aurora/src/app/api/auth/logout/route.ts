import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut({
    scope: 'local',
  });

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ success: true });
}
