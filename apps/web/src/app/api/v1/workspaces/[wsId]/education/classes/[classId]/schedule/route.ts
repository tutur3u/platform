import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { learnerProgressRoutesEnabled } from '@/lib/education/learner-progress-flag';
import { listLmsClassSchedule } from '@/lib/education/lms-class-schedule';
import { lmsLearningAccessFailure } from '@/lib/education/lms-learning-access';
import {
  lmsFailure,
  lmsNotAvailable,
  lmsPrivateHeaders,
} from '@/lib/education/lms-response';
import { resolveLmsViewAccess } from '@/lib/education/lms-view-access';

const maxWindowMs = 90 * 24 * 60 * 60 * 1000;
const instantSchema = z.iso
  .datetime({ offset: true })
  .refine(
    (value) =>
      value.length <= 32 &&
      !value.startsWith('0000-') &&
      Number.isFinite(Date.parse(value))
  );
const cursorSchema = z
  .string()
  .max(69)
  .regex(/^[^|]+\|[^|]+$/)
  .transform((cursor) => {
    const [startsAt, id] = cursor.split('|');
    return { startsAt, id };
  })
  .pipe(z.object({ startsAt: instantSchema, id: z.uuid() }));

const querySchema = z
  .object({
    view: z.enum(['learning', 'staff']).default('learning'),
    student_id: z.uuid().optional(),
    from: instantSchema,
    to: instantSchema,
    updated_since: instantSchema.optional(),
    after: cursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine(({ view, student_id, from, to }) => {
    const start = Date.parse(from);
    const end = Date.parse(to);
    return (
      (view === 'learning' || !student_id) &&
      start < end &&
      end - start <= maxWindowMs
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
    return lmsFailure(400, 'LMS_INVALID_QUERY', 'Invalid class schedule query');
  }

  try {
    const { view, student_id, from, to, updated_since, after, limit } =
      query.data;
    const access = await resolveLmsViewAccess({
      request,
      wsId: routeWsId,
      view,
      studentId: student_id,
    });
    if (access.error) return access.error;

    const { db, scope, wsId } = access;
    const rows = await listLmsClassSchedule({
      after,
      classId,
      db,
      from,
      to,
      updatedSince: updated_since,
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
        data: page.map((row) => ({
          id: row.id,
          title: row.title,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          start_timezone: row.start_timezone,
          end_timezone: row.end_timezone,
          status: row.status,
          updated_at: row.updated_at,
        })),
        next_cursor:
          rows.length > limit && last ? `${last.starts_at}|${last.id}` : null,
      },
      { headers: lmsPrivateHeaders }
    );
  } catch (error) {
    const accessError = lmsLearningAccessFailure(error);
    if (accessError) return accessError;
    console.error('Failed to read LMS class schedule', error);
    return lmsFailure(
      500,
      'LMS_UNAVAILABLE',
      'Failed to load the class schedule'
    );
  }
}
