import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWebAbuseDecision } from './abuse-risk';

export type SessionAdaptiveAuthKind = 'app-session' | 'session' | 'temp';

export type WebAbuseDecision = Awaited<
  ReturnType<typeof resolveWebAbuseDecision>
>;

export type SessionSecurityLookups = {
  decision: Promise<WebAbuseDecision>;
  suspension: Promise<NextResponse | null>;
};

function getUserCreatedAt(user: SupabaseUser) {
  return (user as SupabaseUser & { created_at?: string | null }).created_at;
}

/** The suspension 403 for a suspended user, or null. Fails open. */
export async function checkSuspensionResponse(
  userId: string
): Promise<NextResponse | null> {
  try {
    const { checkUserSuspension } =
      await import('@tuturuuu/utils/abuse-protection/user-suspension');
    const suspension = await checkUserSuspension(userId);
    if (suspension.suspended) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: suspension.reason ?? 'Account suspended',
        },
        { status: 403 }
      );
    }
  } catch {
    // User suspension module not yet available or failed — fail-open
  }
  return null;
}

/**
 * Starts the suspension check and the abuse-risk decision for an
 * authenticated user at the same time. Each depends only on the user, so
 * neither network round trip waits on the other. Callers still apply them in
 * order: a suspension 403 wins before any step-up or rate-limit response. The
 * decision is observed here so an early return never leaves it unhandled,
 * while awaiting it later still surfaces its error.
 */
export function startSessionSecurityLookups({
  authKind,
  endpoint,
  ipAddress,
  isRead,
  request,
  user,
}: {
  authKind: SessionAdaptiveAuthKind;
  endpoint: string;
  ipAddress: string;
  isRead: boolean;
  request: NextRequest;
  user: SupabaseUser;
}): SessionSecurityLookups {
  const decision = Promise.resolve(
    resolveWebAbuseDecision({
      authKind,
      ipAddress,
      isRead,
      method: request.method,
      request,
      route: endpoint,
      userCreatedAt: getUserCreatedAt(user),
      userId: user.id,
    })
  );
  decision.catch(() => {});
  return { decision, suspension: checkSuspensionResponse(user.id) };
}
