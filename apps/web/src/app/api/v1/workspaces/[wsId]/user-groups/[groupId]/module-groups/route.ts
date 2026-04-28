import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TablesInsert } from '@tuturuuu/types';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

interface RouteParams {
  groupId: string;
  wsId: string;
}

const RouteParamsSchema = z.object({
  groupId: z.guid(),
  wsId: z.string().min(1),
});

const CreateModuleGroupSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    icon: z.string().trim().max(255).optional(),
    color: z
      .string()
      .trim()
      .max(7)
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
  })
  .strict();

export const GET = withSessionAuth(
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

    const { data, error } = await sbAdmin
      .from('workspace_course_module_groups')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_key', { ascending: true });

    if (error) {
      return NextResponse.json(
        { message: 'Error fetching workspace course module groups' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  },
  { rateLimit: { maxRequests: 60, windowMs: 60000 } }
);

export const POST = withSessionAuth(
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

    const parsed = CreateModuleGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
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

    const { data: maxRow } = await sbAdmin
      .from('workspace_course_module_groups')
      .select('sort_key')
      .eq('group_id', groupId)
      .order('sort_key', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSortKey = (maxRow?.sort_key ?? 0) + 1;

    const insertPayload: TablesInsert<'workspace_course_module_groups'> = {
      group_id: groupId,
      title: parsed.data.title,
      icon: parsed.data.icon ?? null,
      color: parsed.data.color?.toLowerCase() ?? null,
      sort_key: nextSortKey,
    };

    const { data: created, error } = await sbAdmin
      .from('workspace_course_module_groups')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json(
        { message: 'Error creating workspace course module group' },
        { status: 500 }
      );
    }

    return NextResponse.json(created);
  },
  { rateLimit: { maxRequests: 60, windowMs: 60000 } }
);
