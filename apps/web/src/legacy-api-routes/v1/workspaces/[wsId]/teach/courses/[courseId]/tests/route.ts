import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  wsId: z.string().min(1),
});

const CreateTestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  moduleIds: z.array(z.guid()).min(1),
  startAt: z.string().datetime().nullable().optional(),
  durationInMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

const UpdateTestSchema = z.object({
  id: z.guid(),
  is_published: z.boolean().optional(),
  is_score_published: z.boolean().optional(),
  name: z.string().trim().min(1).max(255).optional(),
  startAt: z.string().datetime().nullable().optional(),
  durationInMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

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
      permission: 'view_user_groups',
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
      .from('course_tests')
      .select(
        'id, course_id, name, created_at, start_at, duration_in_minutes, description, is_published, is_score_published, course_test_modules(module_id)'
      )
      .eq('course_id', parsedParams.data.courseId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch course tests', { error });
      return NextResponse.json(
        { message: 'Error fetching course tests' },
        { status: 500 }
      );
    }

    const tests = (data ?? []).map((t) => ({
      id: t.id,
      course_id: t.course_id,
      name: t.name,
      created_at: t.created_at,
      start_at: t.start_at,
      duration_in_minutes: t.duration_in_minutes,
      description: t.description,
      is_published: t.is_published,
      is_score_published: t.is_score_published,
      module_ids:
        (t.course_test_modules as { module_id: string }[] | undefined)?.map(
          (m) => m.module_id
        ) ?? [],
    }));

    return NextResponse.json({ data: tests });
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

    const parsedBody = CreateTestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'update_user_groups',
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

    const { name, moduleIds, startAt, durationInMinutes, description } =
      parsedBody.data;
    const uniqueModuleIds = [...new Set(moduleIds)];

    const { data: selectedModules, error: selectedModulesError } =
      await access.sbAdmin
        .from('workspace_course_modules')
        .select('id')
        .eq('group_id', parsedParams.data.courseId)
        .in('id', uniqueModuleIds);

    if (selectedModulesError) {
      console.error('Failed to validate course test modules', {
        error: selectedModulesError,
      });
      return NextResponse.json(
        { message: 'Error validating course test modules' },
        { status: 500 }
      );
    }

    if ((selectedModules ?? []).length !== uniqueModuleIds.length) {
      return NextResponse.json(
        { message: 'Invalid course test module selection' },
        { status: 400 }
      );
    }

    const { data: testId, error: testError } = await access.sbAdmin.rpc(
      'create_course_test_with_modules',
      {
        p_course_id: parsedParams.data.courseId,
        p_description: description ?? undefined,
        p_duration_in_minutes: durationInMinutes ?? undefined,
        p_module_ids: uniqueModuleIds,
        p_name: name,
        p_start_at: startAt ?? undefined,
      }
    );

    if (testError || !testId) {
      console.error('Failed to create course test', { error: testError });
      return NextResponse.json(
        { message: 'Error creating course test' },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: testId });
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

    const parsedBody = UpdateTestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'update_user_groups',
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

    const {
      id,
      is_published,
      is_score_published,
      name,
      startAt,
      durationInMinutes,
      description,
    } = parsedBody.data;

    const updatePayload: {
      is_published?: boolean;
      is_score_published?: boolean;
      name?: string;
      start_at?: string | null;
      duration_in_minutes?: number | null;
      description?: string | null;
    } = {};
    if (is_published !== undefined) updatePayload.is_published = is_published;
    if (is_score_published !== undefined)
      updatePayload.is_score_published = is_score_published;
    if (name !== undefined) updatePayload.name = name;
    if (startAt !== undefined) updatePayload.start_at = startAt;
    if (durationInMinutes !== undefined)
      updatePayload.duration_in_minutes = durationInMinutes;
    if (description !== undefined) updatePayload.description = description;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { message: 'No fields provided to update' },
        { status: 400 }
      );
    }

    const { data: updatedTest, error } = await access.sbAdmin
      .from('course_tests')
      .update(updatePayload)
      .eq('id', id)
      .eq('course_id', parsedParams.data.courseId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to update course test', { error });
      return NextResponse.json(
        { message: 'Error updating course test' },
        { status: 500 }
      );
    }

    if (!updatedTest) {
      return NextResponse.json(
        { message: 'Course test not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 60, windowMs: 60000 },
  }
);
