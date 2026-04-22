import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { Constants, type TablesUpdate } from '@tuturuuu/types';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

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
    description: z.string().max(2000).optional(),
    name: z.string().trim().min(1).max(255).optional(),
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
    if (parsedBody.data.cert_template !== undefined) {
      updatePayload.cert_template = parsedBody.data.cert_template;
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
      console.error('Failed to update workspace course', error);
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

    const access = await validateWorkspaceAccess(
      parsedParams.data.wsId,
      context.user.id,
      context.supabase
    );
    if (access instanceof NextResponse) return access;

    const { data: deleted, error } = await context.supabase
      .from('workspace_user_groups')
      .delete()
      .eq('id', parsedParams.data.courseId)
      .eq('is_guest', false)
      .eq('ws_id', access.normalizedWsId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to delete workspace course', error);
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
  { rateLimit: { maxRequests: 60, windowMs: 60000 } }
);
