import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const ModuleOrderSchema = z.object({
  moduleIds: z.array(z.string().uuid()).min(1).max(500),
});

interface RouteParams {
  wsId: string;
  groupId: string;
}

export const PATCH = withSessionAuth(
  async (request, context, params: RouteParams | Promise<RouteParams>) => {
    const { wsId, groupId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId, context.supabase);

    const { data: membership, error: membershipError } = await context.supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', context.user.id)
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

    const parsed = ModuleOrderSchema.safeParse(await request.json());
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
      return NextResponse.json(
        { message: 'Group not found' },
        { status: 404 }
      );
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

    const updates = moduleIds.map((moduleId, index) =>
      sbAdmin
        .from('workspace_course_modules')
        .update({ sort_key: index + 1 })
        .eq('id', moduleId)
        .eq('group_id', groupId)
    );

    const results = await Promise.all(updates);
    const failedUpdate = results.find((result) => result.error);

    if (failedUpdate?.error) {
      return NextResponse.json(
        { message: 'Failed to persist module order' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 60 } }
);
