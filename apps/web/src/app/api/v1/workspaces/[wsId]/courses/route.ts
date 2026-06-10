import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { Constants } from '@tuturuuu/types';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const certificateTemplateOptions = Constants.public.Enums.certificate_templates;

const RouteParamsSchema = z.object({
  wsId: z.string().min(1),
});

const CourseCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  cert_template: z
    .enum([...certificateTemplateOptions] as [
      (typeof certificateTemplateOptions)[number],
      ...(typeof certificateTemplateOptions)[number][],
    ])
    .optional(),
  ending_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  is_course_published: z.boolean().optional(),
  sessions: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .max(750)
    .optional(),
  starting_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

async function validateWorkspaceAccess(
  wsId: string,
  userId: string,
  supabase: TypedSupabaseClient
) {
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

  const membership = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId,
    supabase,
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

  return { normalizedWsId };
}

export const GET = withSessionAuth(
  async (
    request,
    context,
    params: { wsId: string } | Promise<{ wsId: string }>
  ) => {
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
    if (permissions.withoutPermission('view_user_groups')) {
      return NextResponse.json(
        { message: 'Insufficient permissions to view courses' },
        { status: 403 }
      );
    }

    const q = request.nextUrl.searchParams.get('q')?.trim();
    const status = request.nextUrl.searchParams.get('status') ?? 'active';
    const page = Math.max(
      Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1,
      1
    );
    const pageSize = Math.min(
      Math.max(
        Number.parseInt(
          request.nextUrl.searchParams.get('pageSize') ??
            `${DEFAULT_PAGE_SIZE}`,
          10
        ) || DEFAULT_PAGE_SIZE,
        1
      ),
      MAX_PAGE_SIZE
    );

    const queryBuilder = context.supabase
      .from('workspace_user_groups')
      .select(
        'id, name, description, cert_template, created_at, archived, ending_date, is_course_published, sessions, starting_date, workspace_course_modules(id), workspace_user_groups_users!workspace_user_roles_users_role_id_fkey(user_id)',
        { count: 'exact' }
      )
      .eq('ws_id', access.normalizedWsId)
      .eq('is_guest', false)
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      queryBuilder.eq('archived', status === 'archived');
    }

    if ((q?.length ?? 0) > 0) {
      queryBuilder.ilike('name', `%${q}%`);
    }

    const from = (page - 1) * pageSize;
    queryBuilder.range(from, from + pageSize - 1);

    const { data, error, count } = await queryBuilder;
    if (error) {
      serverLogger.error('Failed to fetch workspace courses', { error });
      return NextResponse.json(
        { message: 'Error fetching workspace courses' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: (data ?? []).map((course) => ({
        id: course.id,
        name: course.name,
        description: course.description,
        cert_template: course.cert_template,
        created_at: course.created_at,
        archived: course.archived,
        ending_date: course.ending_date,
        is_course_published: course.is_course_published,
        members_count: course.workspace_user_groups_users?.length ?? 0,
        modules_count: course.workspace_course_modules?.length ?? 0,
        sessions: course.sessions ?? [],
        starting_date: course.starting_date,
      })),
      count: count ?? 0,
      page,
      pageSize,
    });
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { windowMs: 60000, maxRequests: 120 },
  }
);

export const POST = withSessionAuth(
  async (
    request,
    context,
    params: { wsId: string } | Promise<{ wsId: string }>
  ) => {
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
    if (permissions.withoutPermission('create_user_groups')) {
      return NextResponse.json(
        { message: 'Insufficient permissions to create courses' },
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

    const parsedBody = CourseCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const { error, data } = await context.supabase
      .from('workspace_user_groups')
      .insert({
        ...parsedBody.data,
        ws_id: access.normalizedWsId,
        archived: false,
        is_guest: false,
        is_course_published: parsedBody.data.is_course_published ?? false,
      })
      .select('id')
      .single();

    if (error) {
      serverLogger.error('Failed to create workspace course', { error });
      return NextResponse.json(
        { message: 'Error creating workspace course' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success', id: data.id });
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { windowMs: 60000, maxRequests: 60 },
  }
);
