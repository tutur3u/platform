import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_members')
    .select('id:ws_id, role, workspaces(name)')
    .order('sort_key')
    .order('created_at', { ascending: false });

  if (error)
    return NextResponse.json(
      { message: 'Error fetching workspaces' },
      { status: 500 }
    );

  return NextResponse.json(
    data.map(({ id, role, workspaces }) => ({
      id,
      role,
      ...workspaces,
    }))
  );
}
