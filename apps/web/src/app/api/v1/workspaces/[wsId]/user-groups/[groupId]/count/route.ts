import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { validateWorkspaceApiKey } from '@/lib/workspace-api-key';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const { wsId, groupId } = await params;

  if (!groupId)
    return NextResponse.json({ message: 'Invalid group ID' }, { status: 400 });

  if (!wsId)
    return NextResponse.json(
      { message: 'Invalid workspace ID' },
      { status: 400 }
    );

  const apiKey = (await headers()).get('API_KEY');
  return apiKey
    ? getDataWithApiKey({ wsId, groupId, apiKey })
    : getDataFromSession({ wsId, groupId });
}

async function getDataWithApiKey({
  wsId,
  groupId,
  apiKey,
}: {
  wsId: string;
  groupId: string;
  apiKey: string;
}) {
  const sbAdmin = await createAdminClient();

  const apiCheckQuery = validateWorkspaceApiKey(wsId, apiKey);

  const mainQuery = sbAdmin
    .from('workspace_user_groups_users')
    .select('count(), workspace_user_groups!inner(id, ws_id)')
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('workspace_user_groups.id', groupId)
    .maybeSingle();

  const [apiCheck, response] = await Promise.all([apiCheckQuery, mainQuery]);

  if (!apiCheck) {
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  const { data, error } = response;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data?.count || 0);
}

async function getDataFromSession({
  wsId,
  groupId,
}: {
  wsId: string;
  groupId: string;
}) {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace membership' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select('count(), workspace_user_groups!inner(id, ws_id)')
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('workspace_user_groups.id', groupId)
    .maybeSingle();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data?.count || 0);
}
