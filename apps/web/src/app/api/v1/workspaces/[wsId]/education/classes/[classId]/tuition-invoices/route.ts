import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { learnerProgressRoutesEnabled } from '@/lib/education/learner-progress-flag';
import { listLmsClassTuitionInvoices } from '@/lib/education/lms-class-tuition-invoices';
import {
  lmsAuthFailure,
  lmsFailure,
  lmsNotAvailable,
  lmsPrivateHeaders,
} from '@/lib/education/lms-response';
import { resolveLmsStaffAccess } from '@/lib/education/lms-staff-access';

const querySchema = z
  .object({
    contact_id: z.uuid().optional(),
    after: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

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
      'Invalid class tuition invoice query'
    );
  }

  try {
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'teach' },
    });
    if (!auth.ok) return lmsAuthFailure(auth.response.status);
    const staff = await resolveLmsStaffAccess(auth, routeWsId);
    if (staff.error) return staff.error;
    if (!staff.canViewInvoices) {
      return lmsFailure(
        403,
        'LMS_FORBIDDEN',
        'Class tuition invoice access is denied'
      );
    }

    const { after, contact_id, limit } = query.data;
    const { db, scope, wsId } = staff;
    const rows = await listLmsClassTuitionInvoices({
      after,
      classId,
      contactId: contact_id,
      db,
      limit: limit + 1,
      scope,
      wsId,
    });
    if (rows === null)
      return lmsFailure(404, 'LMS_CLASS_NOT_FOUND', 'Class not found');

    const page = rows.slice(0, limit);
    return NextResponse.json(
      {
        class_id: classId,
        role: scope.kind,
        data: page.map(({ invoice_id, invoice }) => ({
          invoice_id,
          contact_id: invoice.customer_id,
          completed_at: invoice.completed_at,
          status: invoice.completed_at ? 'completed' : 'open',
          subscription_months: invoice.subscription_months,
          valid_until: invoice.valid_until,
          updated_at: null,
        })),
        next_cursor:
          rows.length > limit ? (page.at(-1)?.invoice_id ?? null) : null,
      },
      { headers: lmsPrivateHeaders }
    );
  } catch (error) {
    console.error('Failed to read LMS class tuition invoices', error);
    return lmsFailure(
      500,
      'LMS_UNAVAILABLE',
      'Failed to load class tuition invoices'
    );
  }
}
