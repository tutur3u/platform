import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

const paramsSchema = z.object({
  boardId: z.uuid(),
});

export async function PUT(req: Request, { params }: Params) {
  const { wsId: id, boardId } = await params;
  const parsedSchema = paramsSchema.safeParse({ boardId });
  if (!parsedSchema.success) {
    return NextResponse.json({ message: 'Invalid board ID' }, { status: 400 });
  }
  const supabase = await createClient(req);
  const wsId = await normalizeWorkspaceId(id, supabase);

  const { boardId: parsedBoardId } = parsedSchema.data;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: member, error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

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

  const sbAdmin = await createAdminClient();

  const { error } = await sbAdmin
    .from('workspace_boards')
    .update(updateData)
    .eq('id', parsedBoardId)
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
  const { wsId: id, boardId } = await params;
  const parsedSchema = paramsSchema.safeParse({ boardId });
  if (!parsedSchema.success) {
    return NextResponse.json({ message: 'Invalid board ID' }, { status: 400 });
  }
  const supabase = await createClient(req);
  const wsId = await normalizeWorkspaceId(id, supabase);

  const { boardId: parsedBoardId } = parsedSchema.data;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: member, error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!member) {
    return NextResponse.json(
      { message: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();

  const { error } = await sbAdmin
    .from('workspace_boards')
    .delete()
    .eq('id', parsedBoardId)
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
