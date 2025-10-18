import { createClient } from '@tuturuuu/supabase/next/server';
import { MAX_WORKSPACES_FOR_FREE_USERS } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
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

  // Check workspace creation limits for non-Tuturuuu emails
  if (!isValidTuturuuuEmail(user.email)) {
    const { count, error: countError } = await supabase
      .from('workspaces')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', user.id)
      .eq('deleted', false);

    if (countError) {
      console.error('Error counting workspaces:', countError);
      return NextResponse.json(
        { message: 'Error checking workspace limit' },
        { status: 500 }
      );
    }

    if (count !== null && count >= MAX_WORKSPACES_FOR_FREE_USERS) {
      return NextResponse.json(
        {
          message: `You have reached the maximum limit of ${MAX_WORKSPACES_FOR_FREE_USERS} workspaces. Please upgrade to a paid plan or contact the Tuturuuu team for more information.`,
          code: 'WORKSPACE_LIMIT_REACHED',
        },
        { status: 403 }
      );
    }
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
