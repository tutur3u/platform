import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, Json } from '@tuturuuu/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

interface RouteParams {
  moduleId: string;
  wsId: string;
}

type WorkspaceCourseModuleUpdate =
  Database['public']['Tables']['workspace_course_modules']['Update'];

const UpdateModuleSchema = z
  .object({
    content: z.custom<Json>().optional(),
    extra_content: z.custom<Json>().optional(),
    group_id: z.string().uuid().optional(),
    is_public: z.boolean().optional(),
    is_published: z.boolean().optional(),
    module_group_id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(255).optional(),
    youtube_links: z.array(z.string().trim()).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

async function validateWorkspaceModuleAccess(
  wsId: string,
  moduleId: string,
  userId: string,
  sessionSupabase: TypedSupabaseClient
) {
  const normalizedWsId = await normalizeWorkspaceId(wsId, sessionSupabase);

  const membership = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId: userId,
    supabase: sessionSupabase,
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

  const sbAdmin = await createAdminClient();
  const { data: module, error: moduleError } = await sbAdmin
    .from('workspace_course_modules')
    .select('id, group_id, module_group_id, workspace_user_groups!inner(ws_id)')
    .eq('id', moduleId)
    .eq('workspace_user_groups.ws_id', normalizedWsId)
    .maybeSingle();

  if (moduleError) {
    return NextResponse.json(
      { message: 'Failed to validate module' },
      { status: 500 }
    );
  }

  if (!module) {
    return NextResponse.json({ message: 'Module not found' }, { status: 404 });
  }

  return { module, normalizedWsId, sbAdmin };
}

export const PUT = withSessionAuth(
  async (request, context, params: RouteParams | Promise<RouteParams>) => {
    const { moduleId, wsId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = UpdateModuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const access = await validateWorkspaceModuleAccess(
      wsId,
      moduleId,
      context.user.id,
      context.supabase
    );
    if (access instanceof NextResponse) return access;

    const targetGroupId = parsed.data.group_id ?? access.module.group_id;
    const isChangingGroup = targetGroupId !== access.module.group_id;
    if (isChangingGroup && !parsed.data.module_group_id) {
      return NextResponse.json(
        {
          message:
            'module_group_id is required when changing a module to another group',
        },
        { status: 400 }
      );
    }

    if (isChangingGroup) {
      const { data: targetGroup, error: targetGroupError } = await access.sbAdmin
        .from('workspace_user_groups')
        .select('id')
        .eq('id', targetGroupId)
        .eq('ws_id', access.normalizedWsId)
        .maybeSingle();

      if (targetGroupError) {
        return NextResponse.json(
          { message: 'Failed to validate target group' },
          { status: 500 }
        );
      }

      if (!targetGroup) {
        return NextResponse.json(
          { message: 'Target group not found' },
          { status: 404 }
        );
      }
    }

    if (parsed.data.module_group_id) {
      const { data: moduleGroup, error: moduleGroupError } =
        await access.sbAdmin
          .from('workspace_course_module_groups')
          .select('id')
          .eq('id', parsed.data.module_group_id)
          .eq('group_id', targetGroupId)
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
    }

    const updatePayload: WorkspaceCourseModuleUpdate = parsed.data;
    if (
      parsed.data.module_group_id &&
      parsed.data.module_group_id !== access.module.module_group_id
    ) {
      const { data: lastModuleInTargetGroup, error: lastModuleInTargetGroupError } =
        await access.sbAdmin
          .from('workspace_course_modules')
          .select('sort_key')
          .eq('group_id', targetGroupId)
          .eq('module_group_id', parsed.data.module_group_id)
          .order('sort_key', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

      if (lastModuleInTargetGroupError) {
        return NextResponse.json(
          { message: 'Failed to determine module sort order' },
          { status: 500 }
        );
      }

      // Preserve contiguous ordering in the destination group and avoid
      // unique (module_group_id, sort_key) conflicts when moving modules.
      updatePayload.sort_key = (lastModuleInTargetGroup?.sort_key ?? 0) + 1;
    }

    const { error } = await access.sbAdmin
      .from('workspace_course_modules')
      .update(updatePayload)
      .eq('id', moduleId);

    if (error) {
      console.error('Failed to update workspace course module', {
        error,
        moduleId,
        updatePayload,
      });
      return NextResponse.json(
        { message: 'Error updating workspace course module' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { maxRequests: 60, windowMs: 60000 } }
);

export const DELETE = withSessionAuth(
  async (_request, context, params: RouteParams | Promise<RouteParams>) => {
    const { moduleId, wsId } = await params;

    const access = await validateWorkspaceModuleAccess(
      wsId,
      moduleId,
      context.user.id,
      context.supabase
    );
    if (access instanceof NextResponse) return access;

    const { error } = await access.sbAdmin
      .from('workspace_course_modules')
      .delete()
      .eq('id', moduleId);

    if (error) {
      return NextResponse.json(
        { message: 'Error deleting workspace course module' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { maxRequests: 60, windowMs: 60000 } }
);
