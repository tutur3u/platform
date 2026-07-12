import { createClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const UpdateGroupTagSchema = z.object({
  color: z.string().min(1),
  group_ids: z.array(z.string()).optional(),
  name: z.string().min(1),
});

interface Params {
  params: Promise<{
    wsId: string;
    tagId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { tagId: id, wsId } = await params;

  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('workspace_user_group_tags')
    .select('*, group_ids:workspace_user_group_tag_groups(group_id)')
    .eq('ws_id', wsId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching workspace user group tag', error);
    return NextResponse.json(
      { message: 'Error fetching workspace user group tag' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
    );
  }

  const { group_ids: groupIds, ...tag } = data;

  return NextResponse.json({
    data: {
      ...tag,
      group_ids: (groupIds ?? []).map(
        (group: { group_id: string }) => group.group_id
      ),
    },
  });
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { tagId: id, wsId } = await params;

  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid JSON request body' },
      { status: 400 }
    );
  }

  const parsed = UpdateGroupTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { group_ids: _, ...coreData } = parsed.data;

  const { data, error } = await supabase
    .from('workspace_user_group_tags')
    .update(coreData)
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error updating workspace user group tag', error);
    return NextResponse.json(
      { message: 'Error updating workspace user group tag' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { tagId: id, wsId } = await params;

  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('workspace_user_group_tags')
    .delete()
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error deleting workspace user group tag', error);
    return NextResponse.json(
      { message: 'Error deleting workspace user group tag' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
