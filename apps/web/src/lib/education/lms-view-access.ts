import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NextRequest } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import {
  type LmsLearnerScope,
  resolveLmsLearningAccess,
} from './lms-learning-access';
import { lmsAuthFailure } from './lms-response';
import { type LmsStaffScope, resolveLmsStaffAccess } from './lms-staff-access';

type LmsViewAccess =
  | { error: ReturnType<typeof lmsAuthFailure> }
  | {
      error?: never;
      db: TypedSupabaseClient;
      wsId: string;
      scope: LmsLearnerScope | LmsStaffScope;
      role: 'student' | 'guardian' | 'teacher' | 'administrator';
      readOnly: boolean;
    };

export async function resolveLmsViewAccess({
  request,
  wsId,
  view,
  studentId,
}: {
  request: NextRequest;
  wsId: string;
  view: 'learning' | 'staff';
  studentId?: string;
}): Promise<LmsViewAccess> {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: view === 'staff' ? 'teach' : 'learn' },
  });
  if (!auth.ok) return { error: lmsAuthFailure(auth.response.status) };

  if (view === 'learning')
    return resolveLmsLearningAccess(auth, wsId, studentId);

  const staff = await resolveLmsStaffAccess(auth, wsId);
  if (staff.error) return { error: staff.error };
  return {
    db: staff.db,
    wsId: staff.wsId,
    scope: staff.scope,
    role: staff.scope.kind,
    readOnly: true,
  };
}
