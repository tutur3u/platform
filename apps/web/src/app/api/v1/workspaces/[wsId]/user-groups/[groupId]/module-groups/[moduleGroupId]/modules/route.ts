import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

interface RouteParams {
  groupId: string;
  moduleGroupId: string;
  wsId: string;
}

const WorkspaceGroupParamsSchema = z.object({
  groupId: z.uuid(),
  wsId: z.string().min(1),
});

const RouteParamsSchema = WorkspaceGroupParamsSchema.extend({
  moduleGroupId: z.uuid(),
});

async function validateWorkspaceGroupAccess(
  wsId: string,
  groupId: string,
  userId: string,
  sessionSupabase: TypedSupabaseClient,
  request: Request
) {
  const parsedParams = WorkspaceGroupParamsSchema.safeParse({ groupId, wsId });
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route params', errors: parsedParams.error.issues },
      { status: 400 }
    );
  }

  const normalizedWsId = await normalizeWorkspaceId(wsId, sessionSupabase);

  const { data: membership, error: membershipError } = await sessionSupabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', normalizedWsId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership) {
    return NextResponse.json(
      { message: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  const permissions = await getPermissions({
    request,
    wsId: normalizedWsId,
  });
  if (!permissions?.containsPermission('manage_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data: group, error: groupError } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('id', groupId)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  if (groupError) {
    return NextResponse.json(
      { message: 'Failed to validate group' },
      { status: 500 }
    );
  }

  if (!group) {
    return NextResponse.json({ message: 'Group not found' }, { status: 404 });
  }

  return { sbAdmin };
}

export const GET = withSessionAuth(
  async (request, context, params: RouteParams | Promise<RouteParams>) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const { wsId, groupId, moduleGroupId } = parsedParams.data;

    const access = await validateWorkspaceGroupAccess(
      wsId,
      groupId,
      context.user.id,
      context.supabase,
      request
    );
    if (access instanceof NextResponse) return access;

    const { data: moduleGroup, error: moduleGroupError } = await access.sbAdmin
      .from('workspace_course_module_groups')
      .select('id')
      .eq('id', moduleGroupId)
      .eq('group_id', groupId)
      .maybeSingle();

    if (moduleGroupError) {
      return NextResponse.json(
        { message: 'Failed to validate module group' },
        { status: 500 }
      );
    }

    if (!moduleGroup) {
      return NextResponse.json(
        { message: 'Module group not found' },
        { status: 404 }
      );
    }

    const { data, error } = await access.sbAdmin
      .from('workspace_course_modules')
      .select('*')
      .eq('group_id', groupId)
      .eq('module_group_id', moduleGroupId)
      .order('sort_key', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { message: 'Error fetching workspace course modules' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  },
  { rateLimit: { maxRequests: 60, windowMs: 60000 } }
);
