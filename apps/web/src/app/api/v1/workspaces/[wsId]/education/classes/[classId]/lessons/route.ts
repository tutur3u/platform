import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { learnerProgressRoutesEnabled } from '@/lib/education/learner-progress-flag';
import { listLmsClassLessons } from '@/lib/education/lms-class-lessons';
import {
  lmsLearningAccessFailure,
  resolveLmsLearningAccess,
} from '@/lib/education/lms-learning-access';
import {
  lmsAuthFailure,
  lmsFailure,
  lmsNotAvailable,
  lmsPrivateHeaders,
} from '@/lib/education/lms-response';
import { resolveLmsStaffAccess } from '@/lib/education/lms-staff-access';

const cursorSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d{0,9}):[0-9a-f-]{36}$/i)
  .transform((cursor) => {
    const [sortKey, id] = cursor.split(':');
    return { sortKey: Number(sortKey), id };
  })
  .pipe(z.object({ sortKey: z.int32(), id: z.uuid() }));

const querySchema = z
  .object({
    view: z.enum(['learning', 'staff']).default('learning'),
    student_id: z.uuid().optional(),
    after: cursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine((query) => query.view === 'learning' || !query.student_id);

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
    return lmsFailure(400, 'LMS_INVALID_QUERY', 'Invalid class lessons query');
  }

  try {
    const { view, student_id, after, limit } = query.data;
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: view === 'staff' ? 'teach' : 'learn' },
    });
    if (!auth.ok) return lmsAuthFailure(auth.response.status);

    const access =
      view === 'staff'
        ? await resolveLmsStaffAccess(auth, routeWsId)
        : await resolveLmsLearningAccess(auth, routeWsId, student_id);
    if ('error' in access && access.error) return access.error;

    const { db, scope, wsId } = access;
    const rows = await listLmsClassLessons({
      after,
      classId,
      db,
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
        role: 'role' in access ? access.role : scope.kind,
        read_only: 'readOnly' in access ? access.readOnly : true,
        data: page.map(({ id, name, sort_key, is_published }) => ({
          id,
          name,
          sort_key,
          is_published,
          updated_at: null,
        })),
        next_cursor:
          rows.length > limit && last ? `${last.sort_key}:${last.id}` : null,
      },
      { headers: lmsPrivateHeaders }
    );
  } catch (error) {
    const accessError = lmsLearningAccessFailure(error);
    if (accessError) return accessError;
    console.error('Failed to read LMS class lessons', error);
    return lmsFailure(500, 'LMS_UNAVAILABLE', 'Failed to load class lessons');
  }
}
