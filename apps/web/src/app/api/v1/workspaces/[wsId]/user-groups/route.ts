import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentWorkspaceUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  // Check permissions
  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user groups' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace user groups' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  // Check permissions
  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('create_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create user groups' },
      { status: 403 }
    );
  }

  const data = (await req.json()) as {
    name: string;
    color: string;
    group_ids: string[];
  };

  const { group_ids, ...coreData } = data;

  const { data: group, error } = await supabase
    .from('workspace_user_groups')
    .insert({
      ...coreData,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
