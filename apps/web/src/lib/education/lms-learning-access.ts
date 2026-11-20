import {
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@tuturuuu/education-core/tulearn/service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { resolveSessionAuthContext } from '@/lib/api-auth';
import { lmsFailure, lmsNotAvailable } from './lms-response';

type Authenticated = Extract<
  Awaited<ReturnType<typeof resolveSessionAuthContext>>,
  { ok: true }
>;

export type LmsLearnerScope = { kind: 'student'; contactId: string };

export async function resolveLmsLearningAccess(
  auth: Authenticated,
  routeWsId: string,
  studentId?: string
) {
  const subject = await resolveTulearnSubject({
    requestSupabase: auth.supabase,
    studentId,
    user: auth.user,
    wsId: routeWsId,
  });
  const db = await createAdminClient({ noCookie: true });
  const scope: LmsLearnerScope = {
    kind: 'student',
    contactId: subject.studentWorkspaceUserId,
  };
  const role: 'guardian' | 'student' =
    subject.role === 'parent' ? 'guardian' : 'student';
  return {
    db,
    wsId: subject.wsId,
    scope,
    role,
    readOnly: subject.readOnly,
  };
}

export function lmsLearningAccessFailure(error: unknown) {
  const response = tulearnAccessErrorResponse(error);
  if (!response) return null;
  return response.status === 404
    ? lmsNotAvailable()
    : lmsFailure(403, 'LMS_FORBIDDEN', 'LMS learning access is denied');
}
