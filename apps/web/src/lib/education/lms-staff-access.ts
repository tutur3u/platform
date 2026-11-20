import {
  checkLmsStaffAccess,
  type LmsStaffScope,
} from '@tuturuuu/education-core/education/lms-staff-access';
import type { resolveSessionAuthContext } from '@/lib/api-auth';
import { lmsFailure, lmsNotAvailable } from './lms-response';

type Authenticated = Extract<
  Awaited<ReturnType<typeof resolveSessionAuthContext>>,
  { ok: true }
>;

export type { LmsStaffScope };

export async function resolveLmsStaffAccess(
  auth: Authenticated,
  routeWsId: string
) {
  const access = await checkLmsStaffAccess({
    supabase: auth.supabase,
    user: auth.user,
    wsId: routeWsId,
  });
  if (!access.ok) {
    if (access.reason === 'lookup_failed') {
      return {
        error: lmsFailure(
          500,
          'LMS_UNAVAILABLE',
          'Failed to verify LMS access'
        ),
      };
    }
    if (access.reason === 'education_disabled') {
      return { error: lmsNotAvailable() };
    }
    return {
      error: lmsFailure(403, 'LMS_FORBIDDEN', 'LMS staff access is denied'),
    };
  }

  return {
    canViewContactNames: access.canViewContactNames,
    canViewInvoices: access.canViewInvoices,
    db: access.db,
    scope: access.scope,
    wsId: access.wsId,
  };
}
