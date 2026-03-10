import { createClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId, boardId: id } = await params;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json(
      { message: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  const data = (await req.json()) as {
    name?: string;
    icon?: Database['public']['Enums']['platform_icon'] | null;
    color?: string;
    archived?: boolean;
    group_ids?: string[];
  };

  const { group_ids: _, archived, ...coreData } = data;

  const updateData: typeof coreData & { archived_at?: string | null } = {
    ...coreData,
  };

  if (archived !== undefined) {
    updateData.archived_at = archived ? new Date().toISOString() : null;
  }

  const { error } = await supabase
    .from('workspace_boards')
    .update(updateData)
    .eq('id', id)
    .eq('ws_id', wsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace board' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId, boardId: id } = await params;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json(
      { message: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('workspace_boards')
    .delete()
    .eq('id', id)
    .eq('ws_id', wsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace board' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
