import { createAdminClient } from '@/utils/supabase/client';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_: Request) {
  const sbAdmin = createAdminClient();

  if (!sbAdmin) {
    return NextResponse.json(
      { message: 'Error fetching prompts' },
      { status: 500 }
    );
  }

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
