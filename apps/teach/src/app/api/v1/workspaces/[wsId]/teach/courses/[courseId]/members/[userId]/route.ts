import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@tuturuuu/education-core/teach/api';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  userId: z.guid(),
  wsId: z.string().min(1),
});

export const DELETE = withSessionAuth(
  async (
    _request,
    context,
    params:
      | { wsId: string; courseId: string; userId: string }
      | Promise<{ wsId: string; courseId: string; userId: string }>
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
      permission: 'manage_courses',
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

    const { error } = await access.sbAdmin
      .schema('private')
      .rpc('admin_delete_workspace_user_group_member_with_audit_actor', {
        p_ws_id: access.normalizedWsId,
        p_group_id: parsedParams.data.courseId,
        p_user_id: parsedParams.data.userId,
        p_actor_auth_uid: access.userId,
      });

    if (error) {
      console.error('Failed to remove Teach course member', { error });
      return NextResponse.json(
        { message: 'Error removing course member' },
        { status: error.code === '42501' ? 403 : 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 60, windowMs: 60000 },
  }
);
