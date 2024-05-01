import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

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

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const { name } = await req.json();

  const { error } = await supabase
    .from('workspaces')
    .insert({
      name,
    })
    .single();

  if (error)
    return NextResponse.json(
      { message: 'Error creating workspace' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}
