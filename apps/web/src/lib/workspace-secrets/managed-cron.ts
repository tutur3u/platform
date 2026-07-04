import 'server-only';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';

export const MANAGED_CRON_ENABLED_SECRET = 'MANAGED_CRON_ENABLED';

export function isManagedCronEnableSecretName(name?: string | null) {
  return name?.trim().toUpperCase() === MANAGED_CRON_ENABLED_SECRET;
}

export async function canMutateManagedCronEnableSecret(request: Request) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  return isExactTuturuuuDotComEmail(user?.email);
}
