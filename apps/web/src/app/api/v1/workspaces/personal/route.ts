import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // Check if user already has a personal workspace
  const { data: existingPersonal } = await supabase
    .from('workspaces')
    .select('id')
    .eq('personal', true)
    .eq('creator_id', user.id)
    .maybeSingle();

  if (existingPersonal) {
    return NextResponse.json(
      { message: 'Already has personal workspace' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name: 'PERSONAL',
      personal: true,
    })
    .select('id')
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Failed to create personal workspace' },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { workspaceId } = await req.json();
  if (!workspaceId)
    return NextResponse.json(
      { message: 'workspaceId is required' },
      { status: 400 }
    );

  // Ensure the workspace is owned by the user and has only 1 member
  const { data: ws, error: wsError } = await supabase
    .from('workspaces')
    .select('id, creator_id, workspace_members(count)')
    .eq('id', workspaceId)
    .single();

  if (wsError || !ws)
    return NextResponse.json(
      { message: 'Workspace not found' },
      { status: 404 }
    );
  if (ws.creator_id !== user.id)
    return NextResponse.json(
      { message: 'Must be the creator' },
      { status: 403 }
    );

  const memberCount = ws.workspace_members?.[0]?.count as number | undefined;
  if (!memberCount || memberCount !== 1)
    return NextResponse.json(
      { message: 'Workspace must have exactly 1 member' },
      { status: 400 }
    );

  // Ensure user has no other personal workspace
  const { data: existingPersonal } = await supabase
    .from('workspaces')
    .select('id')
    .eq('personal', true)
    .eq('creator_id', user.id)
    .maybeSingle();

  if (existingPersonal)
    return NextResponse.json(
      { message: 'Already has personal workspace' },
      { status: 400 }
    );

  const { error } = await supabase
    .from('workspaces')
    .update({ personal: true })
    .eq('id', workspaceId);
  if (error)
    return NextResponse.json(
      { message: 'Failed to mark personal workspace' },
      { status: 500 }
    );

  return NextResponse.json({ id: workspaceId });
}
