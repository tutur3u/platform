import 'server-only';
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
import { createClient } from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { z } from 'zod';

export async function programmingServerContext() {
  const user = await getSatelliteAppSessionUser('learn');
  if (!user) throw new InternalApiError('Please sign in to Learn', 401);
  return { user, supabase: await createClient() };
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
