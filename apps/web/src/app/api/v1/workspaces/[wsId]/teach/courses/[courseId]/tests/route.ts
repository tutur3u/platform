import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
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
      .select('id, course_id, name, created_at, course_test_modules(module_id)')
      .eq('course_id', parsedParams.data.courseId)
      .order('created_at', { ascending: false });

    if (error) {
      serverLogger.error('Failed to fetch course tests', { error });
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

    const { name, moduleIds } = parsedBody.data;

    // Create course test
    const { data: testData, error: testError } = await access.sbAdmin
      .from('course_tests')
      .insert({
        course_id: parsedParams.data.courseId,
        name,
      })
      .select('id')
      .single();

    if (testError) {
      serverLogger.error('Failed to create course test', { error: testError });
      return NextResponse.json(
        { message: 'Error creating course test' },
        { status: 500 }
      );
    }

    const testId = testData.id;

    // Associate modules
    const associations = moduleIds.map((moduleId) => ({
      test_id: testId,
      module_id: moduleId,
    }));

    const { error: assocError } = await access.sbAdmin
      .from('course_test_modules')
      .insert(associations);

    if (assocError) {
      serverLogger.error('Failed to create course test module associations', {
        error: assocError,
      });
      // Cleanup created test to maintain consistency (atomic behavior fallback)
      await access.sbAdmin.from('course_tests').delete().eq('id', testId);

      return NextResponse.json(
        { message: 'Error creating course test module associations' },
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
