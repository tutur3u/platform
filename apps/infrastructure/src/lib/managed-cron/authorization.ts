import 'server-only';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';

export async function getManagedCronAdminUser(
  request?: Pick<Request, 'headers'>
) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  return isExactTuturuuuDotComEmail(user?.email) ? user : null;
}

export async function hasManagedCronAdminAccess(
  request?: Pick<Request, 'headers'>
) {
  return Boolean(await getManagedCronAdminUser(request));
}
