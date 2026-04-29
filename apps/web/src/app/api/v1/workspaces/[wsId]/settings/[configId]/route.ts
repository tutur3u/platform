import { DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  listWorkspaceDefaultIncludedGroupIds,
  replaceWorkspaceDefaultIncludedGroupIds,
} from '@/lib/workspace-default-included-groups';
import { getWorkspaceConfig } from '@/lib/workspace-helper';

interface Params {
  params: Promise<{
    wsId: string;
    configId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId: rawWsId, configId: id } = await params;
  const supabase = await createClient(req);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Normalize workspace ID to UUID (handles 'personal', 'internal', etc.)
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!memberCheck.ok) {
    return NextResponse.json(
      { message: 'Workspace access denied' },
      { status: 403 }
    );
  }

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { withoutPermission } = permissions;
  if (withoutPermission('manage_workspace_settings')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to modify workspace settings' },
      { status: 403 }
    );
  }

  if (
    id === 'default_wallet_id' &&
    withoutPermission('change_finance_wallets')
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions to change the default wallet' },
      { status: 403 }
    );
  }

  const { value } = await req.json();
  if (value !== undefined && value !== null && typeof value !== 'string') {
    return NextResponse.json(
      { message: 'Invalid workspace config value' },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();

  if (id === DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID) {
    const { errorMessage } = await replaceWorkspaceDefaultIncludedGroupIds(
      sbAdmin,
      wsId,
      value
    );

    if (errorMessage) {
      return NextResponse.json({ message: errorMessage }, { status: 500 });
    }

    return NextResponse.json({ message: 'success' });
  }

  const { error } = await sbAdmin
    .from('workspace_configs')
    .upsert({
      id,
      ws_id: wsId,
      value: value ?? '',
      updated_at: new Date().toISOString(),
    })
    .eq('ws_id', wsId)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      {
        message:
          error.message || error.details || 'Error upserting workspace config',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: rawWsId, configId: id } = await params;
  const supabase = await createClient(req);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({}, { status: 401 });
  }

  // Normalize workspace ID to UUID (handles 'personal', 'internal', etc.)
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return NextResponse.json({}, { status: 500 });
  }

  if (!memberCheck.ok) {
    return NextResponse.json({}, { status: 403 });
  }

  const sbAdmin = await createAdminClient();

  if (id === DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID) {
    const { data, errorMessage } = await listWorkspaceDefaultIncludedGroupIds(
      sbAdmin,
      wsId
    );

    if (errorMessage) {
      return NextResponse.json({ message: errorMessage }, { status: 500 });
    }

    return NextResponse.json({
      value: data.length > 0 ? data.join(',') : null,
    });
  }

  const value = await getWorkspaceConfig(wsId, id);

  if (value === null) {
    return NextResponse.json({}, { status: 404 });
  }

  return NextResponse.json({ value });
}
