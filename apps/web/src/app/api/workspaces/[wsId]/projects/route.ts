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

async function requireWorkspaceMember(request: Request, rawWsId: string) {
  const supabase = await createClient(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    return {
      error: NextResponse.json(
        { message: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!membership) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  const permissions = await getPermissions({ wsId, request });
  if (!permissions?.containsPermission('manage_projects')) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { wsId, user };
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await requireWorkspaceMember(req, rawWsId);

  if ('error' in access) {
    return access.error;
  }

  const { wsId } = access;
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('workspace_boards')
    .select('*')
    .eq('ws_id', wsId)
    .single();

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
  const { wsId: rawWsId } = await params;
  const access = await requireWorkspaceMember(req, rawWsId);

  if ('error' in access) {
    return access.error;
  }

  const { wsId, user } = access;
  const supabase = await createAdminClient();
  const data = await req.json();

  const { error } = await supabase.from('workspace_boards').insert({
    ...data,
    ws_id: wsId,
    creator_id: user.id,
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
