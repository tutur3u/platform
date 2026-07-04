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

const AddMembersSchema = z.object({
  memberIds: z.array(z.guid()).min(1).max(200),
  role: z.enum(['STUDENT', 'TEACHER']).optional(),
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
      .from('workspace_user_groups_users')
      .select(
        'role, workspace_users!workspace_user_roles_users_user_id_fkey(id, display_name, full_name, email, avatar_url, archived)'
      )
      .eq('group_id', parsedParams.data.courseId)
      .order('role', { ascending: true });

    if (error) {
      console.error('Failed to fetch Teach course members', { error });
      return NextResponse.json(
        { message: 'Error fetching course members' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: (data ?? []).map((row) => ({
        ...(Array.isArray(row.workspace_users)
          ? row.workspace_users[0]
          : row.workspace_users),
        role: row.role,
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

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'update_user_groups',
      wsId: parsedParams.data.wsId,
    });
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

    const parsedBody = AddMembersSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

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

    const uniqueMemberIds = [...new Set(parsedBody.data.memberIds)];
    const { data: users, error: usersError } = await access.sbAdmin
      .from('workspace_users')
      .select('id')
      .eq('ws_id', access.normalizedWsId)
      .eq('archived', false)
      .in('id', uniqueMemberIds);

    if (usersError) {
      console.error('Failed to validate Teach course members', {
        error: usersError,
      });
      return NextResponse.json(
        { message: 'Error validating course members' },
        { status: 500 }
      );
    }

    if ((users ?? []).length !== uniqueMemberIds.length) {
      return NextResponse.json(
        { message: 'One or more users do not belong to this workspace' },
        { status: 400 }
      );
    }

    const { error } = await access.sbAdmin
      .from('workspace_user_groups_users')
      .upsert(
        uniqueMemberIds.map((memberId) => ({
          group_id: parsedParams.data.courseId,
          role: parsedBody.data.role ?? 'STUDENT',
          user_id: memberId,
        })),
        { onConflict: 'group_id,user_id' }
      );

    if (error) {
      console.error('Failed to add Teach course members', { error });
      return NextResponse.json(
        { message: 'Error adding course members' },
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
