import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { validateWorkspaceApiKey } from '@/lib/workspace-api-key';

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId, userId } = await params;

  if (!userId)
    return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });

  if (!wsId)
    return NextResponse.json(
      { message: 'Invalid workspace ID' },
      { status: 400 }
    );

  const apiKey = (await headers()).get('API_KEY');
  return apiKey
    ? getDataWithApiKey({ wsId, userId, apiKey })
    : getDataFromSession({ request, wsId, userId });
}

async function getDataWithApiKey({
  wsId,
  userId,
  apiKey,
}: {
  wsId: string;
  userId: string;
  apiKey: string;
}) {
  const sbAdmin = await createAdminClient();

  const apiCheckQuery = validateWorkspaceApiKey(wsId, apiKey);

  const mainQuery = sbAdmin
    .from('workspace_user_groups_users')
    .select('*, workspace_user_groups!inner(*)')
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('user_id', userId);

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

  return NextResponse.json(data);
}

async function getDataFromSession({
  request,
  wsId,
  userId,
}: {
  request: Request;
  wsId: string;
  userId: string;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const user = getAppSessionUserFromRequest(request, { targetApp: 'finance' });

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase: sbAdmin,
    requiredType: 'MEMBER',
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
    .select('*, workspace_user_groups!inner(*)')
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('user_id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
