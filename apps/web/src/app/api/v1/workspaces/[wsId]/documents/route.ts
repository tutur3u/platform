import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const data = await req.json();

  const { wsId: id } = await params;
  const wsId = await normalizeWorkspaceId(id, supabase);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('ws_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions || permissions.withoutPermission('manage_documents')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data: doc, error } = await sbAdmin
    .from('workspace_documents')
    .insert({
      ...data,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating document' },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: doc.id, message: 'success' });
}
