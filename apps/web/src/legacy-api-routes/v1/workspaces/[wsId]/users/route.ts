import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { syncWorkspaceUserGuestMembership } from '@/lib/user-groups/guest-membership';
import { validateWorkspaceApiKey } from '@/lib/workspace-api-key';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function buildWorkspaceUsersRpcQuery(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  searchQuery: string
) {
  return sbAdmin
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: [],
        excluded_groups: [],
        search_query: searchQuery,
        include_archived: true,
        link_status: 'all',
      },
      { count: 'exact' }
    )
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('display_name', { ascending: true, nullsFirst: false });
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

const CreateUserSchema = z.object({
  full_name: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  display_name: z.string().max(MAX_NAME_LENGTH).optional(),
  email: z.email().optional(),
  phone: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  gender: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  birthday: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(), // ISO string format expected
  ethnicity: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  guardian: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  national_id: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  address: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  note: z.string().max(MAX_MEDIUM_TEXT_LENGTH).optional(),
  is_guest: z.boolean().optional(),
});

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

  const apiCheckQuery = validateWorkspaceApiKey(wsId, apiKey);

  const query = searchParams.get('q') || searchParams.get('query');
  const from = parseInt(searchParams.get('from') || '0', 10);
  const to = parseInt(searchParams.get('to') || '-1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const mainQuery = buildWorkspaceUsersRpcQuery(sbAdmin, wsId, query ?? '');
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
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, sbAdmin } = access.context;
  const searchParams = new URLSearchParams(req.nextUrl.search);
  const query = searchParams.get('q') || searchParams.get('query');
  const from = parseInt(searchParams.get('from') || '0', 10);
  const to = parseInt(searchParams.get('to') || '-1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const mainQuery = buildWorkspaceUsersRpcQuery(sbAdmin, wsId, query ?? '');
  applyPagination({ query: mainQuery, from, to, limit });

  const { data, count, error } = await mainQuery;

  if (error) {
    console.error('Error fetching workspace users:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data || [], count: count ?? 0 });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;
  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('create_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create users' },
      { status: 403 }
    );
  }

  // Validate request body
  const rawData = await req.json();
  const validationResult = CreateUserSchema.safeParse(rawData);

  if (!validationResult.success) {
    return NextResponse.json(
      {
        message: 'Invalid request body',
        errors: validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const data = validationResult.data;

  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const { user: actorUser } = await resolveAuthenticatedSessionUser(supabase);
  // Separate control flags from user payload
  // Do NOT allow archived or archived_until during creation
  const { is_guest, ...userPayload } = data ?? {};

  const { data: createdUser, error } = await sbAdmin.rpc(
    'admin_create_workspace_user_with_audit_actor',
    {
      p_ws_id: wsId,
      p_payload: userPayload,
      p_actor_auth_uid: actorUser?.id ?? undefined,
    }
  );

  if (error) {
    console.error('Error creating workspace user:', error);
    return NextResponse.json(
      { message: 'Error creating workspace user' },
      { status: 500 }
    );
  }

  let warning: string | undefined;
  if (is_guest && createdUser?.id) {
    warning = await syncWorkspaceUserGuestMembership({
      isGuest: true,
      sbAdmin,
      userId: createdUser.id,
      warningMessages: {
        linkFailed: 'User created, but failed to link to guest group.',
        noGuestGroups:
          'User created, but no guest group found in this workspace.',
        resolveFailed:
          'User created, but no guest group found in this workspace.',
      },
      wsId,
    });
  }

  return NextResponse.json({ message: 'success', warning });
}
