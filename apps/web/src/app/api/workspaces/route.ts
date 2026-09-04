import { createClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { createLegacyHeadHandler } from '@/legacy-api-routes/head';

export async function GET() {
  await connection();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_members')
    .select('id:ws_id, workspaces(name)')
    .order('sort_key')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching workspaces' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    data.map(({ id, workspaces }) => ({
      id,
      ...workspaces,
      color: 'bg-blue-500',
    }))
  );
}

export const HEAD = createLegacyHeadHandler(GET);
