import { resolveTulearnSubject } from '../tulearn/access';
import type { TulearnSubject } from '../tulearn/types';
import type { EducationAuthContext } from '../types';
import { checkEducationWorkspaceAccess } from './access';

/** Author access is distinct from linked learner/parent access. */
export function checkProgrammingAuthorAccess({
  context,
  wsId,
}: {
  context: EducationAuthContext;
  wsId: string;
}) {
  return checkEducationWorkspaceAccess({
    context,
    wsId,
    permission: 'manage_users',
  });
}

export async function resolveProgrammingLearnerAccess({
  context,
  wsId,
  studentId,
}: {
  context: EducationAuthContext;
  wsId: string;
  studentId?: string;
}): Promise<TulearnSubject> {
  return resolveTulearnSubject({
    requestSupabase: context.supabase,
    user: context.user,
    wsId,
    studentId,
  });
}
