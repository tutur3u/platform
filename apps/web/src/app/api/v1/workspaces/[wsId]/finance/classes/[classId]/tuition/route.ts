import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { learnerProgressRoutesEnabled } from '@/lib/education/learner-progress-flag';
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
import { listClassTuition } from '@/lib/finance/class-tuition';

const inputSchema = z
  .strictObject({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    view: z.enum(['learning', 'staff']).default('learning'),
    student_id: z.uuid().optional(),
    after: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((input) =>
    input.view === 'learning' ? !input.after : !input.student_id
  );

type Params = { params: Promise<{ wsId: string; classId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  await connection();
  if (!learnerProgressRoutesEnabled()) return lmsNotAvailable();

  const { wsId, classId } = await params;
  const entries = Array.from(request.nextUrl.searchParams);
  const input = inputSchema.safeParse(Object.fromEntries(entries));
  if (
    !input.success ||
    new Set(entries.map(([key]) => key)).size !== entries.length ||
    !z.uuid().safeParse(classId).success
  ) {
    return lmsFailure(
      400,
      'FINANCE_INVALID_QUERY',
      'Invalid class tuition query'
    );
  }

  try {
    const { view, student_id, after, limit, month } = input.data;
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: view === 'staff' ? 'teach' : 'learn' },
    });
    if (!auth.ok) return lmsAuthFailure(auth.response.status);

    const access =
      view === 'staff'
        ? await resolveLmsStaffAccess(auth, wsId)
        : await resolveLmsLearningAccess(auth, wsId, student_id);
    if ('error' in access && access.error) return access.error;
    if ('canViewInvoices' in access && !access.canViewInvoices) {
      return lmsFailure(
        403,
        'FINANCE_FORBIDDEN',
        'Class tuition access is denied'
      );
    }
    const role = 'role' in access ? access.role : access.scope.kind;
    const result = await listClassTuition({
      after,
      classId,
      db: access.db,
      limit: view === 'learning' ? 1 : limit,
      month,
      scope: access.scope,
      wsId: access.wsId,
    });
    if (!result) {
      return lmsFailure(404, 'FINANCE_CLASS_NOT_FOUND', 'Class not found');
    }

    return NextResponse.json(
      {
        class_id: classId,
        data: result.data,
        month,
        next_cursor: result.nextCursor,
        role,
      },
      { headers: lmsPrivateHeaders }
    );
  } catch (error) {
    const denied = lmsLearningAccessFailure(error);
    if (denied) return denied;
    console.error('Failed to read Finance class tuition', error);
    return lmsFailure(
      500,
      'FINANCE_UNAVAILABLE',
      'Failed to load class tuition'
    );
  }
}
