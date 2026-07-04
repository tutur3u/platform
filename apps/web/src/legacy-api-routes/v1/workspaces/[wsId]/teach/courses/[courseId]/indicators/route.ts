import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
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

const CreateIndicatorSchema = z.object({
  factor: z.number().positive().optional(),
  is_weighted: z.boolean().optional(),
  name: z.string().trim().min(1).max(255),
  unit: z.string().trim().max(64).optional(),
});

const UpdateIndicatorValuesSchema = z
  .array(
    z.object({
      indicator_id: z.guid(),
      user_id: z.guid(),
      value: z.number().nullable(),
    })
  )
  .max(500);

type UpdateIndicatorValue = z.infer<typeof UpdateIndicatorValuesSchema>[number];
type IndicatorValueTargetValidationIssue = 'invalid-indicator' | 'invalid-user';

async function validateIndicatorValueTargets({
  courseId,
  db,
  values,
  wsId,
}: {
  courseId: string;
  db: TypedSupabaseClient;
  values: UpdateIndicatorValue[];
  wsId: string;
}): Promise<IndicatorValueTargetValidationIssue | null> {
  if (!values.length) return null;

  const indicatorIds = [...new Set(values.map((value) => value.indicator_id))];
  const userIds = [...new Set(values.map((value) => value.user_id))];

  const [indicatorsResult, membersResult] = await Promise.all([
    db
      .from('user_group_metrics')
      .select('id')
      .eq('ws_id', wsId)
      .eq('group_id', courseId)
      .in('id', indicatorIds),
    db
      .from('workspace_user_groups_users')
      .select(
        'user_id, workspace_users!workspace_user_roles_users_user_id_fkey!inner(id)'
      )
      .eq('group_id', courseId)
      .in('user_id', userIds)
      .eq('workspace_users.ws_id', wsId)
      .eq('workspace_users.archived', false),
  ]);

  if (indicatorsResult.error) throw indicatorsResult.error;
  if (membersResult.error) throw membersResult.error;

  const validIndicatorIds = new Set(
    (indicatorsResult.data ?? []).map((indicator) => indicator.id)
  );
  if (indicatorIds.some((indicatorId) => !validIndicatorIds.has(indicatorId))) {
    return 'invalid-indicator';
  }

  const validUserIds = new Set(
    (membersResult.data ?? []).map((member) => member.user_id)
  );
  if (userIds.some((userId) => !validUserIds.has(userId))) {
    return 'invalid-user';
  }

  return null;
}

export const GET = withSessionAuth(
  async (
    _request,
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
      permission: 'view_user_groups_scores',
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

    const [metricsResult, valuesResult] = await Promise.all([
      access.sbAdmin
        .from('user_group_metrics')
        .select('id, name, factor, unit, is_weighted, created_at')
        .eq('group_id', parsedParams.data.courseId)
        .order('created_at', { ascending: true }),
      access.sbAdmin
        .from('user_indicators')
        .select(
          'user_id, indicator_id, value, user_group_metrics!inner(group_id)'
        )
        .eq('user_group_metrics.group_id', parsedParams.data.courseId),
    ]);

    if (metricsResult.error) {
      console.error('Failed to fetch Teach indicators', {
        error: metricsResult.error,
      });
      return NextResponse.json(
        { message: 'Error fetching indicators' },
        { status: 500 }
      );
    }

    if (valuesResult.error) {
      console.error('Failed to fetch Teach indicator values', {
        error: valuesResult.error,
      });
      return NextResponse.json(
        { message: 'Error fetching indicator values' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      indicators: metricsResult.data ?? [],
      values: (valuesResult.data ?? []).map((value) => ({
        indicator_id: value.indicator_id,
        user_id: value.user_id,
        value: value.value,
      })),
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

    const parsedBody = CreateIndicatorSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'create_user_groups_scores',
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

    const { data, error } = await access.sbAdmin
      .from('user_group_metrics')
      .insert({
        factor: parsedBody.data.factor ?? 1,
        group_id: parsedParams.data.courseId,
        is_weighted: parsedBody.data.is_weighted ?? true,
        name: parsedBody.data.name,
        unit: parsedBody.data.unit ?? '',
        ws_id: access.normalizedWsId,
      })
      .select('id, name, factor, unit, is_weighted, created_at')
      .single();

    if (error) {
      console.error('Failed to create Teach indicator', { error });
      return NextResponse.json(
        { message: 'Error creating indicator' },
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

export const PATCH = withSessionAuth(
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

    const parsedBody = UpdateIndicatorValuesSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'update_user_groups_scores',
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

    let targetValidationIssue: IndicatorValueTargetValidationIssue | null;
    try {
      targetValidationIssue = await validateIndicatorValueTargets({
        courseId: parsedParams.data.courseId,
        db: access.sbAdmin,
        values: parsedBody.data,
        wsId: access.normalizedWsId,
      });
    } catch (error) {
      console.error('Failed to validate Teach indicator value targets', {
        error,
      });
      return NextResponse.json(
        { message: 'Error validating indicator values' },
        { status: 500 }
      );
    }

    if (targetValidationIssue === 'invalid-indicator') {
      return NextResponse.json(
        { message: 'Indicator values must belong to this course' },
        { status: 400 }
      );
    }

    if (targetValidationIssue === 'invalid-user') {
      return NextResponse.json(
        { message: 'Indicator users must be enrolled in this course' },
        { status: 400 }
      );
    }

    if (parsedBody.data.length === 0) {
      return NextResponse.json({ message: 'success' });
    }

    const actorId = await getTeachActorWorkspaceUserId({
      db: access.sbAdmin,
      platformUserId: context.user.id,
      wsId: access.normalizedWsId,
    });

    const { error } = await access.sbAdmin.from('user_indicators').upsert(
      parsedBody.data.map((value) => ({
        creator_id: actorId,
        indicator_id: value.indicator_id,
        user_id: value.user_id,
        value: value.value,
      }))
    );

    if (error) {
      console.error('Failed to save Teach indicator values', { error });
      return NextResponse.json(
        { message: 'Error saving indicator values' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 60, windowMs: 60000 },
  }
);
