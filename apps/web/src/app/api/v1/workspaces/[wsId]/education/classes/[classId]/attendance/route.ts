import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { learnerProgressRoutesEnabled } from '@/lib/education/learner-progress-flag';
import { listLmsClassAttendance } from '@/lib/education/lms-class-attendance';
import { lmsLearningAccessFailure } from '@/lib/education/lms-learning-access';
import {
  lmsFailure,
  lmsNotAvailable,
  lmsPrivateHeaders,
} from '@/lib/education/lms-response';
import { resolveLmsViewAccess } from '@/lib/education/lms-view-access';

const maxWindowMs = 90 * 24 * 60 * 60 * 1000;
const dateSchema = z.iso.date().refine((date) => !date.startsWith('0000-'));
const cursorSchema = z
  .string()
  .length(47)
  .transform((cursor) => {
    const [date, id] = cursor.split(':');
    return { date, id };
  })
  .pipe(z.object({ date: dateSchema, id: z.uuid() }));

const querySchema = z
  .object({
    view: z.enum(['learning', 'staff']).default('learning'),
    student_id: z.uuid().optional(),
    from: dateSchema,
    to: dateSchema,
    after: cursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine(({ view, student_id, from, to, after }) => {
    const windowMs = Date.parse(to) - Date.parse(from);
    return (
      (view === 'learning' || !student_id) &&
      windowMs > 0 &&
      windowMs <= maxWindowMs &&
      (!after || (after.date >= from && after.date < to))
    );
  });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; classId: string }> }
) {
  await connection();
  if (!learnerProgressRoutesEnabled()) return lmsNotAvailable();

  const { wsId: routeWsId, classId } = await params;
  const rawQuery = Array.from(request.nextUrl.searchParams);
  const query = querySchema.safeParse(Object.fromEntries(rawQuery));
  if (
    !query.success ||
    new Set(rawQuery.map(([key]) => key)).size !== rawQuery.length ||
    !z.uuid().safeParse(classId).success
  ) {
    return lmsFailure(
      400,
      'LMS_INVALID_QUERY',
      'Invalid class attendance query'
    );
  }

  try {
    const { view, student_id, from, to, after, limit } = query.data;
    const access = await resolveLmsViewAccess({
      request,
      wsId: routeWsId,
      view,
      studentId: student_id,
    });
    if (access.error) return access.error;

    const { db, scope, wsId } = access;
    const rows = await listLmsClassAttendance({
      after,
      classId,
      db,
      from,
      to,
      limit: limit + 1,
      scope,
      wsId,
    });
    if (rows === null)
      return lmsFailure(404, 'LMS_CLASS_NOT_FOUND', 'Class not found');

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return NextResponse.json(
      {
        class_id: classId,
        role: access.role,
        data: page.map(({ id, date, user_id, session_id, status }) => ({
          id,
          date,
          contact_id: user_id,
          session_id,
          status,
          updated_at: null,
        })),
        next_cursor:
          rows.length > limit && last ? `${last.date}:${last.id}` : null,
      },
      { headers: lmsPrivateHeaders }
    );
  } catch (error) {
    const accessError = lmsLearningAccessFailure(error);
    if (accessError) return accessError;
    console.error('Failed to read LMS class attendance', error);
    return lmsFailure(
      500,
      'LMS_UNAVAILABLE',
      'Failed to load class attendance'
    );
  }
}
