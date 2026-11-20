import {
  hasEducationEnabled,
  resolveStudentForPlatformUser,
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@tuturuuu/education-core/tulearn/service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { listLmsClasses } from '@/lib/education/lms-class-catalog';
import { learnerProgressRoutesEnabled } from '@/lib/education/learner-progress-flag';

const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
};

const querySchema = z
  .object({
    view: z.enum(['learning', 'staff']).default('learning'),
    student_id: z.uuid().optional(),
    after: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine((query) => query.view === 'learning' || !query.student_id);

function failure(
  status: 400 | 401 | 403 | 404 | 500,
  code: string,
  message: string
) {
  return NextResponse.json({ code, message }, { status, headers });
}

function unavailable() {
  return failure(404, 'LMS_NOT_AVAILABLE', 'LMS is unavailable');
}

function forbidden() {
  return failure(403, 'LMS_FORBIDDEN', 'Class catalog access is denied');
}

function classPage(
  classes: Awaited<ReturnType<typeof listLmsClasses>>,
  {
    limit,
    role,
    readOnly,
  }: {
    limit: number;
    role: 'student' | 'guardian' | 'teacher' | 'administrator';
    readOnly: boolean;
  }
) {
  const rows = classes.slice(0, limit);
  return NextResponse.json(
    {
      role,
      read_only: readOnly,
      data: rows.map((row) => ({ ...row, updated_at: null })),
      next_cursor: classes.length > limit ? (rows.at(-1)?.id ?? null) : null,
    },
    { headers }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  if (!learnerProgressRoutesEnabled()) return unavailable();

  const rawQuery = Array.from(request.nextUrl.searchParams);
  const query = querySchema.safeParse(Object.fromEntries(rawQuery));
  if (
    !query.success ||
    new Set(rawQuery.map(([key]) => key)).size !== rawQuery.length
  ) {
    return failure(400, 'LMS_INVALID_QUERY', 'Invalid class catalog query');
  }

  try {
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: {
        targetApp: query.data.view === 'staff' ? 'teach' : 'learn',
      },
    });
    if (!auth.ok) {
      return auth.response.status === 403
        ? forbidden()
        : failure(401, 'LMS_UNAUTHENTICATED', 'Authentication required');
    }

    const { wsId: routeWsId } = await params;
    const { after, limit, view, student_id } = query.data;
    if (view === 'learning') {
      const subject = await resolveTulearnSubject({
        requestSupabase: auth.supabase,
        studentId: student_id,
        user: auth.user,
        wsId: routeWsId,
      });
      const db = await createAdminClient({ noCookie: true });
      const classes = await listLmsClasses({
        after,
        db,
        limit: limit + 1,
        scope: { kind: 'student', contactId: subject.studentWorkspaceUserId },
        wsId: subject.wsId,
      });
      return classPage(classes, {
        limit,
        role: subject.role === 'parent' ? 'guardian' : 'student',
        readOnly: subject.readOnly,
      });
    }

    const wsId = await normalizeWorkspaceId(routeWsId, auth.supabase);
    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: auth.user.id,
      supabase: auth.supabase,
      requiredType: 'MEMBER',
    });
    if (membership.error === 'membership_lookup_failed') {
      return failure(
        500,
        'LMS_UNAVAILABLE',
        'Failed to verify class catalog access'
      );
    }
    if (!membership.ok) return forbidden();
    const permissions = await getPermissions({ user: auth.user, wsId });
    if (!permissions?.containsPermission('view_user_groups'))
      return forbidden();

    const db = await createAdminClient({ noCookie: true });
    if (!(await hasEducationEnabled(wsId, db))) return unavailable();

    const canManage = permissions.containsPermission('update_user_groups');
    const contact = canManage
      ? null
      : await resolveStudentForPlatformUser({
          db,
          platformUserId: auth.user.id,
          wsId,
        });

    const role = canManage ? 'administrator' : 'teacher';
    const classes = canManage
      ? await listLmsClasses({
          after,
          db,
          limit: limit + 1,
          scope: { kind: 'administrator' },
          wsId,
        })
      : contact
        ? await listLmsClasses({
            after,
            db,
            limit: limit + 1,
            scope: { kind: 'teacher', contactId: contact.workspace_user_id },
            wsId,
          })
        : [];
    return classPage(classes, { limit, role, readOnly: true });
  } catch (error) {
    const accessError = tulearnAccessErrorResponse(error);
    if (accessError) {
      return accessError.status === 404 ? unavailable() : forbidden();
    }
    console.error('Failed to read LMS class catalog', error);
    return failure(500, 'LMS_UNAVAILABLE', 'Failed to load the class catalog');
  }
}
