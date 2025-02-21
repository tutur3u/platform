import { createAdminClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(_: Request) {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('ai_models')
    .select('*', {
      count: 'exact',
    })
    .eq('enabled', true)
    .order('name', { ascending: true });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching AI Models' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
