import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const ModuleGroupOrderSchema = z.object({
  moduleGroupIds: z.array(z.uuid()).max(500),
});

const RouteParamsSchema = z.object({
  groupId: z.uuid(),
  wsId: z.string().min(1),
});

interface RouteParams {
  wsId: string;
  groupId: string;
}

export const PATCH = withSessionAuth(
  async (request, context, params: RouteParams | Promise<RouteParams>) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const { wsId, groupId } = parsedParams.data;
    const normalizedWsId = await normalizeWorkspaceId(wsId, context.supabase);

    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: context.user.id,
      supabase: context.supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = ModuleGroupOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { moduleGroupIds } = parsed.data;
    if (new Set(moduleGroupIds).size !== moduleGroupIds.length) {
      return NextResponse.json(
        { message: 'Module group IDs must be unique' },
        { status: 400 }
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

    const { data: existingGroups, error: groupsError } = await sbAdmin
      .from('workspace_course_module_groups')
      .select('id')
      .eq('group_id', groupId);

    if (groupsError) {
      return NextResponse.json(
        { message: 'Failed to validate module groups' },
        { status: 500 }
      );
    }

    const existingIds = new Set((existingGroups ?? []).map((g) => g.id));
    if (existingIds.size !== moduleGroupIds.length) {
      return NextResponse.json(
        {
          message:
            'Module group order payload must include all group module groups',
        },
        { status: 400 }
      );
    }

    const hasUnknown = moduleGroupIds.some((id) => !existingIds.has(id));
    if (hasUnknown) {
      return NextResponse.json(
        {
          message:
            'Module group order payload contains unknown module group IDs',
        },
        { status: 400 }
      );
    }

    const { error: reorderError } = await sbAdmin.rpc(
      'reorder_workspace_course_module_groups',
      {
        p_group_id: groupId,
        p_module_group_ids: moduleGroupIds,
      }
    );

    if (reorderError) {
      return NextResponse.json(
        { message: 'Failed to persist module group order' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 60 } }
);
