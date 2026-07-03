import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { listUserGroupSessionDatesByGroupIds } from '@/lib/user-groups/session-schedule';
import { validateWorkspaceApiKey } from '@/lib/workspace-api-key';

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

type UserGroupMembershipRow = Record<string, unknown> & {
  workspace_user_groups?: (Record<string, unknown> & { id?: string }) | null;
};

async function attachSessionDates({
  data,
  sbAdmin,
  wsId,
}: {
  data: unknown[] | null;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const rows = (data ?? []) as UserGroupMembershipRow[];
  const groupIds = rows
    .map((row) => row.workspace_user_groups?.id)
    .filter((id): id is string => Boolean(id));

  // Session-date enrichment is a best-effort hint. If the sessions subsystem is
  // unavailable (e.g. the table is missing because a migration has not applied),
  // fall back to empty schedules so core user-group listing — and the invoice
  // flows that depend on it — keep working instead of failing the whole request.
  let sessionsByGroupId = new Map<string, string[]>();
  try {
    sessionsByGroupId = await listUserGroupSessionDatesByGroupIds({
      groupIds,
      supabase: sbAdmin,
      wsId,
    });
  } catch (error) {
    serverLogger.error('Error attaching user group session dates:', error);
  }

  return rows.map((row) => {
    const group = row.workspace_user_groups;
    if (!group?.id) return row;

    return {
      ...row,
      workspace_user_groups: {
        ...group,
        sessions: sessionsByGroupId.get(group.id) ?? [],
      },
    };
  });
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

  return NextResponse.json(await attachSessionDates({ data, sbAdmin, wsId }));
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

  return NextResponse.json(
    await attachSessionDates({ data, sbAdmin, wsId: normalizedWsId })
  );
}
