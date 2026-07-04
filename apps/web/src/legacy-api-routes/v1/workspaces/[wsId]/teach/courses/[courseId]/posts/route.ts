import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  getTeachActorWorkspaceUserId,
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  wsId: z.string().min(1),
});

const CreatePostSchema = z.object({
  content: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  notes: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable().optional(),
  title: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
});

export const GET = withSessionAuth(
  async (
    request,
    context,
    params:
      | { wsId: string; courseId: string }
      | Promise<{ wsId: string; courseId: string }>
  ) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'view_user_groups_posts',
      wsId: parsedParams.data.wsId,
    });
    if (access instanceof NextResponse) return access;

    const course = await validateTeachCourse({
      courseId: parsedParams.data.courseId,
      db: access.sbAdmin,
      wsId: access.normalizedWsId,
    });
    if (!course) {
      return NextResponse.json(
        { message: 'Course not found' },
        { status: 404 }
      );
    }

    const limit = Math.min(
      Math.max(
        Number.parseInt(
          request.nextUrl.searchParams.get('limit') ?? '20',
          10
        ) || 20,
        1
      ),
      100
    );
    const cursor = request.nextUrl.searchParams.get('cursor');

    let query = access.sbAdmin
      .schema('private')
      .from('user_group_posts')
      .select('*', { count: 'exact' })
      .eq('group_id', parsedParams.data.courseId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cursor) query = query.lt('created_at', cursor);

    const { count, data, error } = await query;
    if (error) {
      console.error('Failed to fetch Teach posts', { error });
      return NextResponse.json(
        { message: 'Error fetching posts' },
        { status: 500 }
      );
    }

    const posts = data ?? [];
    return NextResponse.json({
      count: count ?? 0,
      data: posts,
      nextCursor:
        posts.length === limit
          ? (posts[posts.length - 1]?.created_at ?? null)
          : null,
    });
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 120, windowMs: 60000 },
  }
);

export const POST = withSessionAuth(
  async (
    request,
    context,
    params:
      | { wsId: string; courseId: string }
      | Promise<{ wsId: string; courseId: string }>
  ) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
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

    const parsedBody = CreatePostSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'create_user_groups_posts',
      wsId: parsedParams.data.wsId,
    });
    if (access instanceof NextResponse) return access;

    const course = await validateTeachCourse({
      courseId: parsedParams.data.courseId,
      db: access.sbAdmin,
      wsId: access.normalizedWsId,
    });
    if (!course) {
      return NextResponse.json(
        { message: 'Course not found' },
        { status: 404 }
      );
    }

    const actorId = await getTeachActorWorkspaceUserId({
      db: access.sbAdmin,
      platformUserId: context.user.id,
      wsId: access.normalizedWsId,
    });

    const { data: approvalConfig, error: approvalConfigError } =
      await access.sbAdmin
        .from('workspace_configs')
        .select('value')
        .eq('ws_id', access.normalizedWsId)
        .eq('id', 'ENABLE_POST_APPROVAL')
        .maybeSingle();

    if (approvalConfigError) {
      console.error('Failed to resolve Teach post approval config', {
        error: approvalConfigError,
      });
      return NextResponse.json(
        { message: 'Error resolving post approval settings' },
        { status: 500 }
      );
    }

    const enablePostApproval = (approvalConfig?.value ?? 'true') === 'true';
    const { data, error } = await access.sbAdmin
      .schema('private')
      .from('user_group_posts')
      .insert({
        ...parsedBody.data,
        group_id: parsedParams.data.courseId,
        creator_id: actorId,
        updated_by: actorId,
        ...(enablePostApproval
          ? {}
          : {
              approved_at: new Date().toISOString(),
              approved_by: actorId,
              post_approval_status: 'APPROVED',
              rejected_at: null,
              rejected_by: null,
              rejection_reason: null,
            }),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create Teach post', { error });
      return NextResponse.json(
        { message: 'Error creating post' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 60, windowMs: 60000 },
  }
);
