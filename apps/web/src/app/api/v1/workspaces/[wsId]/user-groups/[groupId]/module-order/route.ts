import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const ModuleOrderSchema = z.object({
  moduleIds: z.array(z.string().uuid()).min(1).max(500),
});

const RouteParamsSchema = z.object({
  groupId: z.string().uuid(),
  wsId: z.string().min(1),
});

interface RouteParams {
  wsId: string;
  groupId: string;
}

export const PATCH = withSessionAuth(
  // Deprecated compatibility endpoint. Prefer
  // /user-groups/:groupId/module-groups/:moduleGroupId/module-order.
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = ModuleOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { moduleIds } = parsed.data;
    if (new Set(moduleIds).size !== moduleIds.length) {
      return NextResponse.json(
        { message: 'Module IDs must be unique' },
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

    const { data: existingModules, error: modulesError } = await sbAdmin
      .from('workspace_course_modules')
      .select('id')
      .eq('group_id', groupId);

    if (modulesError) {
      return NextResponse.json(
        { message: 'Failed to validate modules' },
        { status: 500 }
      );
    }

    const existingIds = new Set(
      (existingModules ?? []).map((module) => module.id)
    );
    if (existingIds.size !== moduleIds.length) {
      return NextResponse.json(
        { message: 'Module order payload must include all group modules' },
        { status: 400 }
      );
    }

    const hasUnknownModule = moduleIds.some(
      (moduleId) => !existingIds.has(moduleId)
    );
    if (hasUnknownModule) {
      return NextResponse.json(
        { message: 'Module order payload contains unknown module IDs' },
        { status: 400 }
      );
    }

    const { error: reorderError } = await sbAdmin.rpc(
      'reorder_workspace_course_modules',
      {
        p_group_id: groupId,
        p_module_ids: moduleIds,
      }
    );

    if (reorderError) {
      const sanitizedError = {
        message: reorderError.message,
        name: reorderError.name,
        stack: reorderError.stack?.split('\n').slice(0, 5).join('\n'),
      };
      console.error('Failed to reorder modules', {
        groupId,
        modulesPreview: moduleIds.slice(0, 10),
        modulesTotal: moduleIds.length,
        sanitizedError,
      });
      return NextResponse.json(
        { message: 'Failed to persist module order' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 60 } }
);
