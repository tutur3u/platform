import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_members')
    .select('id:ws_id, workspaces(name)')
    .order('sort_key')
    .order('created_at', { ascending: false });

  if (error)
    return NextResponse.json(
      { message: 'Error fetching workspaces' },
      { status: 500 }
    );

  return NextResponse.json(
    data.map(({ id, workspaces }) => ({
      id,
      ...workspaces,
      color: 'bg-blue-500', // Add a default color since the workspaces table doesn't have a color field
    }))
  );
}
