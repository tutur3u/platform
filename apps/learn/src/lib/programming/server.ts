import 'server-only';
import {
  attachSupabaseAuthUser,
  getAppSessionTokenFromRequest,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import {
  checkProgrammingAuthorAccess,
  resolveProgrammingLearnerAccess,
} from '@tuturuuu/education-core/education/programming-access';
import { ProgrammingError } from '@tuturuuu/education-core/education/programming-model';
import {
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { headers } from 'next/headers';
import { z } from 'zod';

export async function programmingServerContext() {
  const user = await getSatelliteAppSessionUser('learn');
  if (!user) throw new InternalApiError('Please sign in to Learn', 401);
  const request = { headers: await headers() };
  if (getAppSessionTokenFromRequest(request)) {
    const verified = verifyAppSessionRequest(request, { targetApp: 'learn' });
    if (!verified.ok || verified.claims.sub !== user.id)
      throw new InternalApiError('Invalid Learn app session', 401);
  }
  // Match the gateway's verified app-session context. Cookie RLS must not
  // substitute a second actor or deny app-session-only workspace membership.
  // Every use still performs explicit actor/workspace/permission checks.
  const admin = await createAdminClient({ noCookie: true });
  return {
    user,
    supabase: attachSupabaseAuthUser(admin as TypedSupabaseClient, user),
  };
}
export async function programmingApiOptions() {
  return withForwardedInternalApiAuth(await headers());
}
export function programmingStudentId(value?: string) {
  if (value === undefined) return undefined;
  const parsed = z.guid().safeParse(value);
  if (!parsed.success)
    throw new ProgrammingError('Invalid learner selection', 400);
  return parsed.data;
}
export async function programmingLearnerScope(
  wsId: string,
  studentId?: string
) {
  const context = await programmingServerContext();
  const subject = await resolveProgrammingLearnerAccess({
    context,
    wsId,
    studentId: programmingStudentId(studentId),
  });
  return { context, subject };
}
export async function programmingAuthorScope(wsId: string) {
  const context = await programmingServerContext();
  const access = await checkProgrammingAuthorAccess({ context, wsId });
  return { context, access };
}
