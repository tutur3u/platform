import 'server-only';
import { resolveTulearnSubject } from '@tuturuuu/education-core/tulearn/service';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createClient } from '@tuturuuu/supabase/next/server';

export async function resolveCodingSubject(wsId: string, studentId?: string) {
  const user = await getSatelliteAppSessionUser('learn');
  if (!user) throw new Error('Please sign in to Learn.');
  return resolveTulearnSubject({
    requestSupabase: await createClient(),
    studentId: studentId ?? null,
    user,
    wsId,
  });
}
