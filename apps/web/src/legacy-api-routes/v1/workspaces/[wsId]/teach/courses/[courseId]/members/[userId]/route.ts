import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@/lib/teach/api';

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

    const { error } = await access.sbAdmin
      .from('workspace_user_groups_users')
      .delete()
      .eq('group_id', parsedParams.data.courseId)
      .eq('user_id', parsedParams.data.userId);

    if (error) {
      console.error('Failed to remove Teach course member', { error });
      return NextResponse.json(
        { message: 'Error removing course member' },
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
