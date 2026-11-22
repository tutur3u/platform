import 'server-only';

import { ENABLE_EDUCATION_SECRET } from '@tuturuuu/education-core/tulearn/constants';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

export function isMeetClassroomDeploymentEnabled() {
  return process.env.MEET_EDUCATION_ENABLED === 'true';
}

/** Checks the room's workspace regardless of the admitted caller's home workspace. */
export async function isMeetClassroomEnabled(wsId: string) {
  if (!isMeetClassroomDeploymentEnabled()) return false;
  try {
    const db = await createAdminClient({ noCookie: true });
    const { data, error } = await db
      .from('workspace_secrets')
      .select('value')
      .eq('ws_id', wsId)
      .eq('name', ENABLE_EDUCATION_SECRET)
      .maybeSingle();
    return !error && data?.value?.trim().toLowerCase() !== 'false';
  } catch {
    return false;
  }
}
