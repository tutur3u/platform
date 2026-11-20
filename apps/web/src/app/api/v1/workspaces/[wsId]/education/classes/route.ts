import {
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@tuturuuu/education-core/tulearn/service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { listLmsClasses } from '@/lib/education/lms-class-catalog';
import {
  lmsAuthFailure,
  lmsFailure,
  lmsNotAvailable,
  lmsPrivateHeaders,
} from '@/lib/education/lms-response';
import { resolveLmsStaffAccess } from '@/lib/education/lms-staff-access';
import { learnerProgressRoutesEnabled } from '@/lib/education/learner-progress-flag';

const querySchema = z
  .object({
    view: z.enum(['learning', 'staff']).default('learning'),
    student_id: z.uuid().optional(),
    after: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine((query) => query.view === 'learning' || !query.student_id);

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
    { headers: lmsPrivateHeaders }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  if (!learnerProgressRoutesEnabled()) return lmsNotAvailable();

  const rawQuery = Array.from(request.nextUrl.searchParams);
  const query = querySchema.safeParse(Object.fromEntries(rawQuery));
  if (
    !query.success ||
    new Set(rawQuery.map(([key]) => key)).size !== rawQuery.length
  ) {
    return lmsFailure(400, 'LMS_INVALID_QUERY', 'Invalid class catalog query');
  }

  try {
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: {
        targetApp: query.data.view === 'staff' ? 'teach' : 'learn',
      },
    });
    if (!auth.ok) return lmsAuthFailure(auth.response.status);

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

    const staff = await resolveLmsStaffAccess(auth, routeWsId);
    if (staff.error) return staff.error;
    const { db, scope, wsId } = staff;
    const classes = await listLmsClasses({
      after,
      db,
      limit: limit + 1,
      scope,
      wsId,
    });
    return classPage(classes, { limit, role: scope.kind, readOnly: true });
  } catch (error) {
    const accessError = tulearnAccessErrorResponse(error);
    if (accessError) {
      return accessError.status === 404
        ? lmsNotAvailable()
        : lmsFailure(403, 'LMS_FORBIDDEN', 'Class catalog access is denied');
    }
    console.error('Failed to read LMS class catalog', error);
    return lmsFailure(
      500,
      'LMS_UNAVAILABLE',
      'Failed to load the class catalog'
    );
  }
}
