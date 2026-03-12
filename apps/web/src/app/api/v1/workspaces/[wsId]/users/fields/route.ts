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

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

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
    .eq('ws_id', normalizedWsId)
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

  const permissions = await getPermissions({ wsId: normalizedWsId, request });
  if (
    !permissions ||
    (!permissions.containsPermission('view_users_private_info') &&
      !permissions.containsPermission('view_users_public_info'))
  ) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await sbAdmin
    .from('workspace_user_fields')
    .select('*')
    .eq('ws_id', normalizedWsId)
    .order('created_at', { ascending: false });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace API configs' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const data = await req.json();
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

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
    .eq('ws_id', normalizedWsId)
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

  const permissions = await getPermissions({
    wsId: normalizedWsId,
    request: req,
  });
  if (!permissions || !permissions.containsPermission('update_users')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const possible_values = data.possible_values
    ? data.possible_values.filter((value: string) => value !== '')
    : null;

  const newData = {
    ...data,
    possible_values: possible_values?.length ? possible_values : null,
  };

  const { error } = await sbAdmin.from('workspace_user_fields').insert({
    ...newData,
    ws_id: normalizedWsId,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
