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
    .select('id, group_id, workspace_user_groups!inner(ws_id)')
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

    const parsed = UpdateModuleSchema.safeParse(await request.json());
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

    if (parsed.data.module_group_id) {
      const { data: moduleGroup, error: moduleGroupError } =
        await access.sbAdmin
          .from('workspace_course_module_groups')
          .select('id')
          .eq('id', parsed.data.module_group_id)
          .eq('group_id', access.module.group_id)
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

    const { error } = await access.sbAdmin
      .from('workspace_course_modules')
      .update(updatePayload)
      .eq('id', moduleId);

    if (error) {
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
