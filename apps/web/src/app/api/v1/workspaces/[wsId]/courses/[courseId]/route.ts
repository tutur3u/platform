import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { Constants, type TablesUpdate } from '@tuturuuu/types';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const certificateTemplateOptions = Constants.public.Enums.certificate_templates;
type CertificateTemplate = (typeof certificateTemplateOptions)[number];

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  wsId: z.string().min(1),
});

const CourseUpdateSchema = z
  .object({
    cert_template: z
      .enum([...certificateTemplateOptions] as [
        CertificateTemplate,
        ...CertificateTemplate[],
      ])
      .optional(),
    archived: z.boolean().optional(),
    description: z.string().max(2000).optional(),
    ending_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    is_course_published: z.boolean().optional(),
    name: z.string().trim().min(1).max(255).optional(),
    sessions: z
      .array(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
      .max(750)
      .optional(),
    starting_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

interface RouteParams {
  courseId: string;
  wsId: string;
}

async function validateWorkspaceAccess(
  wsId: string,
  userId: string,
  supabase: TypedSupabaseClient
) {
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

  const { data: membership, error: membershipError } = await supabase
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

  return { normalizedWsId };
}

export const PUT = withSessionAuth(
  async (request, context, params: RouteParams | Promise<RouteParams>) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const access = await validateWorkspaceAccess(
      parsedParams.data.wsId,
      context.user.id,
      context.supabase
    );
    if (access instanceof NextResponse) return access;

    const permissions = await getPermissions({
      user: context.user,
      wsId: access.normalizedWsId,
    });
    if (!permissions) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    if (permissions.withoutPermission('update_user_groups')) {
      return NextResponse.json(
        { message: 'Insufficient permissions to update courses' },
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

    const parsedBody = CourseUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const updatePayload: TablesUpdate<'workspace_user_groups'> = {};
    if (parsedBody.data.name !== undefined) {
      updatePayload.name = parsedBody.data.name;
    }
    if (parsedBody.data.description !== undefined) {
      updatePayload.description = parsedBody.data.description;
    }
    if (parsedBody.data.ending_date !== undefined) {
      updatePayload.ending_date = parsedBody.data.ending_date;
    }
    if (parsedBody.data.cert_template !== undefined) {
      updatePayload.cert_template = parsedBody.data.cert_template;
    }
    if (parsedBody.data.archived !== undefined) {
      updatePayload.archived = parsedBody.data.archived;
    }
    if (parsedBody.data.is_course_published !== undefined) {
      updatePayload.is_course_published = parsedBody.data.is_course_published;
    }
    if (parsedBody.data.sessions !== undefined) {
      updatePayload.sessions = parsedBody.data.sessions;
    }
    if (parsedBody.data.starting_date !== undefined) {
      updatePayload.starting_date = parsedBody.data.starting_date;
    }

    const { data: updated, error } = await context.supabase
      .from('workspace_user_groups')
      .update(updatePayload)
      .eq('id', parsedParams.data.courseId)
      .eq('is_guest', false)
      .eq('ws_id', access.normalizedWsId)
      .select('id')
      .maybeSingle();

    if (error) {
      serverLogger.error('Failed to update workspace course', { error });
      return NextResponse.json(
        { message: 'Error updating workspace course' },
        { status: 500 }
      );
    }

    if (!updated) {
      return NextResponse.json(
        { message: 'Course not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 60, windowMs: 60000 },
  }
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

    const access = await validateWorkspaceAccess(
      parsedParams.data.wsId,
      context.user.id,
      context.supabase
    );
    if (access instanceof NextResponse) return access;

    const permissions = await getPermissions({
      user: context.user,
      wsId: access.normalizedWsId,
    });
    if (!permissions) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    if (permissions.withoutPermission('update_user_groups')) {
      return NextResponse.json(
        { message: 'Insufficient permissions to delete courses' },
        { status: 403 }
      );
    }

    const { data: deleted, error } = await context.supabase
      .from('workspace_user_groups')
      .delete()
      .eq('id', parsedParams.data.courseId)
      .eq('is_guest', false)
      .eq('ws_id', access.normalizedWsId)
      .select('id')
      .maybeSingle();

    if (error) {
      serverLogger.error('Failed to delete workspace course', { error });
      return NextResponse.json(
        { message: 'Error deleting workspace course' },
        { status: 500 }
      );
    }

    if (!deleted) {
      return NextResponse.json(
        { message: 'Course not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 60, windowMs: 60000 },
  }
);
