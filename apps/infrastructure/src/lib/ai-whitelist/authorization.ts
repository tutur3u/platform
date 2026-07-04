import 'server-only';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';

export async function hasAIWhitelistAccess(request?: Pick<Request, 'headers'>) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  return Boolean(user?.email?.endsWith('@tuturuuu.com'));
}
