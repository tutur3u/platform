import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_MONTHLY_REPORT_TEXT_LENGTH,
  MAX_MONTHLY_REPORT_TITLE_LENGTH,
} from '@/features/reports/report-limits';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getTeachActorWorkspaceUserId,
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  wsId: z.string().min(1),
});

const CreateReportSchema = z.object({
  content: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH),
  feedback: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH),
  score: z.number().nullable().optional(),
  scores: z.array(z.number()).nullable().optional(),
  title: z.string().min(1).max(MAX_MONTHLY_REPORT_TITLE_LENGTH),
  user_id: z.guid(),
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
      permission: 'view_user_groups_reports',
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
    const privateDb = access.sbAdmin.schema('private');

    const limit = Math.min(
      Math.max(
        Number.parseInt(
          request.nextUrl.searchParams.get('limit') ?? '30',
          10
        ) || 30,
        1
      ),
      100
    );

    const { data, error } = await privateDb
      .from('external_user_monthly_reports_workspace_view')
      .select(
        'id, title, content, feedback, score, scores, created_at, updated_at, user_id, report_approval_status, user_full_name, user_display_name, user_email'
      )
      .eq('group_id', parsedParams.data.courseId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      serverLogger.error('Failed to fetch Teach reports', { error });
      return NextResponse.json(
        { message: 'Error fetching reports' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: (data ?? []).map((report) => {
        return {
          ...report,
          user: {
            display_name: report.user_display_name,
            email: report.user_email,
            full_name: report.user_full_name,
            id: report.user_id,
          },
        };
      }),
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

    const parsedBody = CreateReportSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'create_user_groups_reports',
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
    const privateDb = access.sbAdmin.schema('private');

    const { data: membership, error: membershipError } = await access.sbAdmin
      .from('workspace_user_groups_users')
      .select('user_id')
      .eq('group_id', parsedParams.data.courseId)
      .eq('user_id', parsedBody.data.user_id)
      .maybeSingle();

    if (membershipError) {
      serverLogger.error('Failed to validate Teach report recipient', {
        error: membershipError,
      });
      return NextResponse.json(
        { message: 'Error validating report recipient' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { message: 'Report recipient must be enrolled in this course' },
        { status: 400 }
      );
    }

    const { data: existing } = await privateDb
      .from('external_user_monthly_reports')
      .select('id')
      .eq('user_id', parsedBody.data.user_id)
      .eq('group_id', parsedParams.data.courseId)
      .eq('title', parsedBody.data.title)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { message: 'Duplicate report exists' },
        { status: 409 }
      );
    }

    const actorId = await getTeachActorWorkspaceUserId({
      db: access.sbAdmin,
      platformUserId: context.user.id,
      wsId: access.normalizedWsId,
    });
    const now = new Date().toISOString();
    const { data: approvalConfig, error: approvalConfigError } =
      await access.sbAdmin
        .from('workspace_configs')
        .select('value')
        .eq('ws_id', access.normalizedWsId)
        .eq('id', 'ENABLE_REPORT_APPROVAL')
        .maybeSingle();

    if (approvalConfigError) {
      serverLogger.error('Failed to resolve Teach report approval config', {
        error: approvalConfigError,
      });
      return NextResponse.json(
        { message: 'Error resolving report approval settings' },
        { status: 500 }
      );
    }

    const enableReportApproval = (approvalConfig?.value ?? 'true') === 'true';
    const { data, error } = await privateDb
      .from('external_user_monthly_reports')
      .insert({
        content: parsedBody.data.content,
        created_at: now,
        creator_id: actorId,
        feedback: parsedBody.data.feedback,
        group_id: parsedParams.data.courseId,
        score: parsedBody.data.score,
        scores: parsedBody.data.scores,
        title: parsedBody.data.title,
        updated_at: now,
        updated_by: actorId,
        user_id: parsedBody.data.user_id,
        ...(enableReportApproval
          ? {}
          : {
              approved_at: now,
              approved_by: actorId,
              rejected_at: null,
              rejected_by: null,
              rejection_reason: null,
              report_approval_status: 'APPROVED',
            }),
      })
      .select('id')
      .single();

    if (error) {
      serverLogger.error('Failed to create Teach report', { error });
      return NextResponse.json(
        { message: 'Error creating report' },
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
