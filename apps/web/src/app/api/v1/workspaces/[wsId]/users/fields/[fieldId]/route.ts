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
    fieldId: string;
  }>;
}

async function authorizeMutation(request: Request, wsId: string) {
  const supabase = await createClient(request);
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('ws_id')
    .eq('ws_id', normalizedWsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    return {
      error: NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!membership) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  const permissions = await getPermissions({ wsId: normalizedWsId, request });
  if (!permissions || !permissions.containsPermission('update_users')) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { normalizedWsId };
}

export async function PUT(req: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const data = await req.json();
  const { fieldId, wsId } = await params;
  const auth = await authorizeMutation(req, wsId);
  if ('error' in auth) return auth.error;

  const possible_values = data.possible_values
    ? data.possible_values.filter((value: string) => value !== '')
    : null;

  const newData = {
    ...data,
    possible_values: possible_values?.length ? possible_values : null,
  };

  const { error } = await sbAdmin
    .from('workspace_user_fields')
    .update(newData)
    .eq('id', fieldId)
    .eq('ws_id', auth.normalizedWsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(request: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const { fieldId, wsId } = await params;
  const auth = await authorizeMutation(request, wsId);
  if ('error' in auth) return auth.error;

  const { error } = await sbAdmin
    .from('workspace_user_fields')
    .delete()
    .eq('id', fieldId)
    .eq('ws_id', auth.normalizedWsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
