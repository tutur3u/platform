import 'server-only';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { resolveTulearnSubject, TulearnAccessError } from './access';
import type { Db } from './types';

/** Learn-area admission: the existing learner or guardian subject check. */
export async function hasLmsLearningAreaAccess({
  supabase,
  user,
  wsId,
}: {
  supabase: Db;
  user: SupabaseUser;
  wsId: string;
}): Promise<boolean> {
  try {
    await resolveTulearnSubject({
      requestSupabase: supabase,
      user,
      wsId,
    });
    return true;
  } catch (error) {
    if (error instanceof TulearnAccessError) return false;
    throw error;
  }
}
