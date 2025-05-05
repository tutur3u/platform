import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const { name } = await req.json();

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name,
      creator_id: user.id,
    })
    .select('id')
    .single();

  console.log(data, error);

  if (error)
    return NextResponse.json(
      { message: 'Error creating workspace' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success', id: data.id });
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (noRedirect) return null;
    redirect('/login');
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select(
      'id, name, avatar_url, logo_url, created_at, workspace_members!inner(role)'
    )
    .eq('workspace_members.user_id', user.id);

  if (error)
    return NextResponse.json(
      { message: 'Error fetching workspaces' },
      { status: 500 }
    );

  return NextResponse.json(data);
}
