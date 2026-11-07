import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateWorkspaceApiKey } from '../../lib/workspace-api-key';
import {
  canReadWorkspaceUsers,
  redactWorkspaceUser,
} from '../../lib/workspace-user-read-access';
import { handleCreateWorkspaceUserRequest } from './workspace-user-create';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const GroupIdSchema = z.guid();

/**
 * Optional `groupId` narrows the list to members of one user group (any role)
 * through the RPC's existing `included_groups` filter. Absent keeps the
 * workspace-wide list; a malformed value is rejected rather than ignored so a
 * caller never silently receives every workspace user.
 */
function parseGroupFilter(
  searchParams: URLSearchParams
): { ok: true; includedGroups: string[] } | { ok: false } {
  const raw = searchParams.get('groupId');
  if (raw === null || raw === '') return { ok: true, includedGroups: [] };
  const parsed = GroupIdSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, includedGroups: [parsed.data] }
    : { ok: false };
}

const invalidGroupResponse = () =>
  NextResponse.json({ message: 'Invalid groupId' }, { status: 400 });

function buildWorkspaceUsersRpcQuery(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  searchQuery: string,
  includedGroups: string[] = []
) {
  return sbAdmin
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: includedGroups,
        excluded_groups: [],
        search_query: searchQuery,
        include_archived: true,
        link_status: 'all',
      },
      { count: 'exact' }
    )
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('display_name', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });
}

function applyPagination({
  query,
  from,
  limit,
  to,
}: {
  query: ReturnType<typeof buildWorkspaceUsersRpcQuery>;
  from: number;
  limit: number;
  to: number;
}) {
  const safeFrom = Number.isFinite(from) && from >= 0 ? Math.floor(from) : 0;
  const safeLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.min(Math.floor(limit), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  if (Number.isFinite(to) && to >= safeFrom) {
    query.range(safeFrom, Math.min(Math.floor(to), safeFrom + safeLimit - 1));
    return;
  }

  query.range(safeFrom, safeFrom + safeLimit - 1);
}

export async function GET(req: NextRequest, { params }: Params) {
  const { wsId } = await params;

  const apiKey = (await headers()).get('API_KEY');
  return apiKey
    ? getDataWithApiKey(req, { wsId, apiKey })
    : getDataFromSession(req, { wsId });
}

async function getDataWithApiKey(
  req: NextRequest,
  {
    wsId,
    apiKey,
  }: {
    wsId: string;
    apiKey: string;
  }
) {
  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const searchParams = req.nextUrl.searchParams;

  const groupFilter = parseGroupFilter(searchParams);
  if (!groupFilter.ok) return invalidGroupResponse();

  const apiCheckQuery = validateWorkspaceApiKey(wsId, apiKey);

  const query = searchParams.get('q') || searchParams.get('query');
  const from = parseInt(searchParams.get('from') || '0', 10);
  const to = parseInt(searchParams.get('to') || '-1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const mainQuery = buildWorkspaceUsersRpcQuery(
    sbAdmin,
    wsId,
    query ?? '',
    groupFilter.includedGroups
  );
  applyPagination({ query: mainQuery, from, to, limit });

  const [apiCheck, response] = await Promise.all([apiCheckQuery, mainQuery]);

  if (!apiCheck) {
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  const { data, count, error } = response;

  if (error) {
    console.error('Error fetching workspace users with API key:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data, count });
}

async function getDataFromSession(
  req: NextRequest,
  { wsId: rawWsId }: { wsId: string }
) {
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req, {
      targetApp: ['contacts', 'finance', 'platform'],
    })
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, sbAdmin, permissions } = access.context;
  if (!canReadWorkspaceUsers(permissions)) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }
  const searchParams = new URLSearchParams(req.nextUrl.search);
  const groupFilter = parseGroupFilter(searchParams);
  if (!groupFilter.ok) return invalidGroupResponse();

  const query = searchParams.get('q') || searchParams.get('query');
  const from = parseInt(searchParams.get('from') || '0', 10);
  const to = parseInt(searchParams.get('to') || '-1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const mainQuery = buildWorkspaceUsersRpcQuery(
    sbAdmin,
    wsId,
    query ?? '',
    groupFilter.includedGroups
  );
  applyPagination({ query: mainQuery, from, to, limit });

  const { data, count, error } = await mainQuery;

  if (error) {
    console.error('Error fetching workspace users:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: (data ?? []).map((user) => redactWorkspaceUser(user, permissions)),
    count: count ?? 0,
  });
}

export async function POST(req: Request, context: Params) {
  const supabase = await createClient(req);
  const { user: actorUser } = await resolveAuthenticatedSessionUser(supabase);
  if (!actorUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleCreateWorkspaceUserRequest(req, context, actorUser);
}
