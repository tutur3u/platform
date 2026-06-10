import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { validateWorkspaceApiKey } from '@/lib/workspace-api-key';

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
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
    : getDataFromSession({ req: _, wsId, userId });
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
    .select(
      '*, workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(*)'
    )
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('user_id', userId);

  const [apiCheck, response] = await Promise.all([apiCheckQuery, mainQuery]);

  if (!apiCheck) {
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  const { data, error } = response;

  if (error) {
    serverLogger.error('Error fetching user groups with API key:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

async function getDataFromSession({
  req,
  wsId,
  userId,
}: {
  req: Request;
  wsId: string;
  userId: string;
}) {
  const access = await getFinanceRouteContext(
    req,
    wsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, sbAdmin } = access.context;

  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select(
      '*, workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(*)'
    )
    .eq('workspace_user_groups.ws_id', normalizedWsId)
    .eq('user_id', userId);

  if (error) {
    serverLogger.error('Error fetching user groups:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
