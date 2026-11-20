import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listLmsClasses } from '@/lib/education/lms-class-catalog';
import { lmsLearningAccessFailure } from '@/lib/education/lms-learning-access';
import {
  lmsFailure,
  lmsNotAvailable,
  lmsPrivateHeaders,
} from '@/lib/education/lms-response';
import { resolveLmsViewAccess } from '@/lib/education/lms-view-access';
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
    const { wsId: routeWsId } = await params;
    const { after, limit, view, student_id } = query.data;
    const access = await resolveLmsViewAccess({
      request,
      wsId: routeWsId,
      view,
      studentId: student_id,
    });
    if (access.error) return access.error;
    const { db, scope, wsId, role, readOnly } = access;
    const classes = await listLmsClasses({
      after,
      db,
      limit: limit + 1,
      scope,
      wsId,
    });
    return classPage(classes, { limit, role, readOnly });
  } catch (error) {
    const accessError = lmsLearningAccessFailure(error);
    if (accessError) return accessError;
    console.error('Failed to read LMS class catalog', error);
    return lmsFailure(
      500,
      'LMS_UNAVAILABLE',
      'Failed to load the class catalog'
    );
  }
}
