import {
  createAppSessionUser,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';

const NOTIFICATION_APP_SESSION_TARGETS = [
  'contacts',
  'platform',
  'teach',
] as const;

export async function resolveNotificationRouteUser(request: Request) {
  const verification = verifyAppSessionRequest(request, {
    targetApp: NOTIFICATION_APP_SESSION_TARGETS,
  });

  if (verification.ok) {
    return createAppSessionUser(verification.claims);
  }

  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  return user;
}
