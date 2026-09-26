import { requireEducationWorkspaceAccess } from '@tuturuuu/education-core/education/access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';

const ParamsSchema = z.object({
  wsId: z.string().min(1),
  courseId: z.guid(),
});
const CreateModuleSchema = z.object({
  name: z.string().trim().min(1),
  module_group_id: z.guid(),
  sort_key: z.number().int(),
  is_public: z.boolean().optional(),
  is_published: z.boolean().optional(),
});

type Params = { wsId: string; courseId: string };

async function getCourseAccess(
  context: SessionAuthContext,
  params: Params,
  permission: 'view_user_groups' | 'manage_users'
) {
  const access = await requireEducationWorkspaceAccess({
    context,
    permission,
    wsId: params.wsId,
  });
  if (access instanceof NextResponse) return access;

  const { data: course, error } = await access.sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('id', params.courseId)
    .eq('ws_id', access.normalizedWsId)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { message: 'Failed to validate course' },
      { status: 500 }
    );
  }
  if (!course) {
    return NextResponse.json({ message: 'Course not found' }, { status: 404 });
  }
  return access;
}

export const GET = withSessionAuth(
  async (_request, context, params: Params | Promise<Params>) => {
    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid route params' },
        { status: 400 }
      );
    }
    const access = await getCourseAccess(
      context,
      parsed.data,
      'view_user_groups'
    );
    if (access instanceof NextResponse) return access;

    const { data, error } = await access.sbAdmin
      .from('workspace_course_modules')
      .select('*')
      .eq('group_id', parsed.data.courseId)
      .order('sort_key', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Failed to fetch course modules', error);
      return NextResponse.json(
        { message: 'Error fetching workspace course modules' },
        { status: 500 }
      );
    }
    return NextResponse.json(data);
  },
  { rateLimit: { windowMs: 60000, maxRequests: 120 } }
);

export const POST = withSessionAuth(
  async (request, context, params: Params | Promise<Params>) => {
    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid route params' },
        { status: 400 }
      );
    }
    const access = await getCourseAccess(context, parsed.data, 'manage_users');
    if (access instanceof NextResponse) return access;

    const body = CreateModuleSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!body.success) {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { data: moduleGroup, error: groupError } = await access.sbAdmin
      .from('workspace_course_module_groups')
      .select('id')
      .eq('id', body.data.module_group_id)
      .eq('group_id', parsed.data.courseId)
      .maybeSingle();
    if (groupError) {
      return NextResponse.json(
        { message: 'Failed to validate module group' },
        { status: 500 }
      );
    }
    if (!moduleGroup) {
      return NextResponse.json(
        { message: 'Module group not found' },
        { status: 404 }
      );
    }

    const { error } = await access.sbAdmin
      .from('workspace_course_modules')
      .insert({ ...body.data, group_id: parsed.data.courseId });
    if (error) {
      console.error('Failed to create course module', error);
      return NextResponse.json(
        { message: 'Error creating workspace course module' },
        { status: 500 }
      );
    }
    return NextResponse.json({ message: 'success' });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 30 } }
);
