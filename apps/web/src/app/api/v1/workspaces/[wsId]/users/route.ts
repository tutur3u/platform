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
import { validateWorkspaceApiKey } from '@/lib/workspace-api-key';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

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
  if (!Number.isNaN(from) && !Number.isNaN(to) && to >= from)
    mainQuery.range(from, to);
  if (!Number.isNaN(limit)) mainQuery.limit(limit);

  const [apiCheck, response] = await Promise.all([apiCheckQuery, mainQuery]);

  if (!apiCheck) {
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  const { data, count, error } = response;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data, count });
}

async function getDataFromSession(
  req: NextRequest,
  { wsId }: { wsId: string }
) {
  const permissions = await getPermissions({
    wsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const searchParams = new URLSearchParams(req.nextUrl.search);
  const query = searchParams.get('q') || searchParams.get('query');
  const from = parseInt(searchParams.get('from') || '0', 10);
  const to = parseInt(searchParams.get('to') || '-1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const mainQuery = buildWorkspaceUsersRpcQuery(sbAdmin, wsId, query ?? '');
  if (!Number.isNaN(from) && !Number.isNaN(to) && to >= from)
    mainQuery.range(from, to);
  if (!Number.isNaN(limit)) mainQuery.limit(limit);

  const { data, count, error } = await mainQuery;

  if (error) {
    console.log(error);
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
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace user' },
      { status: 500 }
    );
  }

  // If marked as guest, attach the user to the workspace's guest group
  let warning: string | undefined;
  if (is_guest && createdUser?.id) {
    const { data: guestGroup, error: groupError } = await sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('ws_id', wsId)
      .eq('is_guest', true)
      .maybeSingle();

    if (!groupError && guestGroup?.id) {
      // Insert relation; use upsert to handle case where trigger already assigned user to this group
      const { error: linkError } = await sbAdmin
        .from('workspace_user_groups_users')
        .upsert(
          {
            group_id: guestGroup.id,
            user_id: createdUser.id,
          },
          { onConflict: 'group_id, user_id', ignoreDuplicates: true }
        );

      if (linkError) {
        console.log(linkError);
        warning = 'User created, but failed to link to guest group.';
      }
    } else {
      warning = 'User created, but no guest group found in this workspace.';
    }
  }

  return NextResponse.json({ message: 'success', warning });
}
