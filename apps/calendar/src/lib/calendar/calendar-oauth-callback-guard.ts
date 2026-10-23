import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { consumeCalendarOAuthNonce } from './calendar-oauth-nonce-store';
import type {
  CalendarOAuthProvider,
  CalendarOAuthStateVerification,
} from './calendar-oauth-state';
import { calendarOAuthDebug } from './oauth-callback-logger';

type VerifiedState = Extract<CalendarOAuthStateVerification, { ok: true }>;
type AuthorizedContext = Extract<
  Awaited<ReturnType<typeof resolveSessionAuthContext>>,
  { ok: true }
>;

export type CalendarOAuthCallbackAuthorization =
  | {
      ok: true;
      supabase: AuthorizedContext['supabase'];
      user: AuthorizedContext['user'];
      wsId: string;
    }
  | { ok: false; response: NextResponse };

function reject(error: string, status: number) {
  return {
    ok: false as const,
    response: NextResponse.json({ error }, { status }),
  };
}

/**
 * Authorize a provider OAuth callback before any code exchange: the signed
 * state must belong to the signed-in user, the user must still be a member of
 * the state's workspace, and the state must not have been used before.
 */
export async function authorizeCalendarOAuthCallback({
  provider,
  request,
  verifiedState,
}: {
  provider: CalendarOAuthProvider;
  request: Request;
  verifiedState: VerifiedState;
}): Promise<CalendarOAuthCallbackAuthorization> {
  const authContext = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: true,
  });

  if (!authContext.ok) {
    calendarOAuthDebug('❌ [DEBUG] User not authenticated');
    return reject('User not authenticated', 401);
  }
  const { supabase, user } = authContext;

  if (user.id !== verifiedState.userId) {
    calendarOAuthDebug('❌ [DEBUG] OAuth state belongs to another user');
    return reject('Invalid OAuth state', 403);
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: verifiedState.wsId,
    userId: user.id,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return reject('Failed to verify workspace access', 500);
  }

  if (!membership.ok) {
    return reject('Forbidden', 403);
  }

  const consumption = await consumeCalendarOAuthNonce({
    expiresAt: verifiedState.expiresAt,
    nonce: verifiedState.nonce,
    provider,
  });

  if (consumption === 'replayed') {
    calendarOAuthDebug('❌ [DEBUG] OAuth state was already used');
    return reject('Invalid OAuth state', 400);
  }

  if (consumption === 'unavailable') {
    return reject('Calendar connection is temporarily unavailable', 503);
  }

  return { ok: true, supabase, user, wsId: verifiedState.wsId };
}
