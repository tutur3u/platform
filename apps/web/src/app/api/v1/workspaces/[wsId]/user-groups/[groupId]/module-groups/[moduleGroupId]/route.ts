import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TablesUpdate } from '@tuturuuu/types';
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
  moduleGroupId: string;
  wsId: string;
}

const RouteParamsSchema = z.object({
  groupId: z.guid(),
  moduleGroupId: z.guid(),
  wsId: z.string().min(1),
});

const UpdateModuleGroupSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    icon: z.string().trim().max(255).optional(),
    color: z
      .string()
      .trim()
      .max(7)
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const PUT = withSessionAuth(
  async (request, context, params: RouteParams | Promise<RouteParams>) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const { wsId, groupId, moduleGroupId } = parsedParams.data;
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

    const parsed = UpdateModuleGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();

    const { data: existing, error: existingError } = await sbAdmin
      .from('workspace_course_module_groups')
      .select('id')
      .eq('id', moduleGroupId)
      .eq('group_id', groupId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { message: 'Failed to validate module group' },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        { message: 'Module group not found' },
        { status: 404 }
      );
    }

    const updatePayload: TablesUpdate<'workspace_course_module_groups'> = {
      ...parsed.data,
      color: parsed.data.color?.toLowerCase(),
    };

    const { error } = await sbAdmin
      .from('workspace_course_module_groups')
      .update(updatePayload)
      .eq('id', moduleGroupId);

    if (error) {
      return NextResponse.json(
        { message: 'Error updating workspace course module group' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { maxRequests: 60, windowMs: 60000 } }
);

export const DELETE = withSessionAuth(
  async (_request, context, params: RouteParams | Promise<RouteParams>) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const { wsId, groupId, moduleGroupId } = parsedParams.data;
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

    const sbAdmin = await createAdminClient();

    const { data: existing, error: existingError } = await sbAdmin
      .from('workspace_course_module_groups')
      .select('id')
      .eq('id', moduleGroupId)
      .eq('group_id', groupId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { message: 'Failed to validate module group' },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        { message: 'Module group not found' },
        { status: 404 }
      );
    }

    const { error } = await sbAdmin
      .from('workspace_course_module_groups')
      .delete()
      .eq('id', moduleGroupId);

    if (error) {
      return NextResponse.json(
        { message: 'Error deleting workspace course module group' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { maxRequests: 60, windowMs: 60000 } }
);
