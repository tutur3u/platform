import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    wsId: string;
  };
}

export async function GET(_: Request, { params: { wsId: id } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Error fetching user' },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, preset, created_at, workspace_members!inner(role)')
    .eq('id', id)
    .eq('workspace_members.user_id', user.id)
    .single();

  console.log(data, error);

  if (error || !data?.workspace_members[0]?.role)
    return NextResponse.json(
      { message: 'Error fetching workspaces' },
      { status: 500 }
    );

  return NextResponse.json({
    ...data,
    role: data.workspace_members[0].role,
  });
}

export async function PUT(req: Request, { params: { wsId: id } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const { name, preset } = await req.json();

  const { error } = await supabase
    .from('workspaces')
    .update({
      name,
      preset,
    })
    .eq('id', id);

  if (error)
    return NextResponse.json(
      { message: 'Error updating workspace' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params: { wsId: id } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase.from('workspaces').delete().eq('id', id);

  if (error)
    return NextResponse.json(
      { message: 'Error deleting workspace' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}
