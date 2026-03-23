import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  batchUpsert,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

export async function GET(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  const supabase = createAdminClient({ noCookie: true }) as TypedSupabaseClient;
  const { data, error, count } = await supabase
    .from('email_blacklist')
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching email-blacklist', error },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data ?? [], count: count ?? 0 });
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const result = await batchUpsert({
    table: 'email_blacklist',
    data: json?.data || [],
    onConflict: 'entry_type,value',
  });
  return createMigrationResponse(result, 'email-blacklist');
}
