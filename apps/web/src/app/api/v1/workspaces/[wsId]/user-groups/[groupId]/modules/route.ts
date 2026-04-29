import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json, TablesInsert } from '@tuturuuu/types';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

interface RouteParams {
  groupId: string;
  wsId: string;
}

type WorkspaceCourseModuleInsert = TablesInsert<'workspace_course_modules'>;

const RouteParamsSchema = z.object({
  groupId: z.guid(),
  wsId: z.string().min(1),
});

const CreateModuleSchema = z
  .object({
    content: z.custom<Json>().optional(),
    extra_content: z.custom<Json>().optional(),
    is_public: z.boolean().optional(),
    is_published: z.boolean().optional(),
    module_group_id: z.guid(),
    name: z.string().trim().min(1).max(255),
    youtube_links: z.array(z.string().trim()).nullable().optional(),
  })
  .strict();

const MAX_SORT_KEY_INSERT_ATTEMPTS = 3;

async function validateWorkspaceGroupAccess(
  wsId: string,
  groupId: string,
  userId: string,
  sessionSupabase: TypedSupabaseClient,
  request: Request
) {
  const parsedParams = RouteParamsSchema.safeParse({ groupId, wsId });
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
    const { wsId, groupId } = await params;

    const access = await validateWorkspaceGroupAccess(
      wsId,
      groupId,
      context.user.id,
      context.supabase,
      request
    );
    if (access instanceof NextResponse) return access;

    const { data, error } = await access.sbAdmin
      .from('workspace_course_modules')
      .select('*')
      .eq('group_id', groupId)
      .order('module_group_id', { ascending: true })
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

export const POST = withSessionAuth(
  async (request, context, params: RouteParams | Promise<RouteParams>) => {
    const { wsId, groupId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = CreateModuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

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
      .eq('id', parsed.data.module_group_id)
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

    for (
      let attempt = 0;
      attempt < MAX_SORT_KEY_INSERT_ATTEMPTS;
      attempt += 1
    ) {
      const { data: lastModuleInGroup, error: lastModuleInGroupError } =
        await access.sbAdmin
          .from('workspace_course_modules')
          .select('sort_key')
          .eq('group_id', groupId)
          .eq('module_group_id', parsed.data.module_group_id)
          .order('sort_key', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

      if (lastModuleInGroupError) {
        return NextResponse.json(
          { message: 'Failed to determine module sort order' },
          { status: 500 }
        );
      }

      const insertPayload: WorkspaceCourseModuleInsert = {
        content: parsed.data.content ?? null,
        extra_content: parsed.data.extra_content ?? null,
        group_id: groupId,
        is_public: parsed.data.is_public ?? false,
        is_published: parsed.data.is_published ?? false,
        module_group_id: parsed.data.module_group_id,
        name: parsed.data.name,
        sort_key: (lastModuleInGroup?.sort_key ?? 0) + 1,
        youtube_links: parsed.data.youtube_links ?? null,
      };

      const { data: created, error } = await access.sbAdmin
        .from('workspace_course_modules')
        .insert(insertPayload)
        .select('*')
        .single();

      if (!error) {
        return NextResponse.json(created);
      }

      if (error.code !== '23505') {
        return NextResponse.json(
          { message: 'Error creating workspace course module' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { message: 'Failed to allocate a unique module sort order' },
      { status: 409 }
    );
  },
  { rateLimit: { maxRequests: 60, windowMs: 60000 } }
);
