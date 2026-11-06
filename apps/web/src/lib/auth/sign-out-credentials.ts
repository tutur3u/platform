import {
  type CrossAppTokenStore,
  revokeCrossAppTokensForUser,
} from '@tuturuuu/auth/cross-app';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { revokeUserAiTempAuthTokens } from '@tuturuuu/utils/ai-temp-auth';

type SessionClient = Pick<TypedSupabaseClient, 'auth' | 'rpc'>;

/** Cross-app tokens in Supabase, revoked through the caller-bound RPC. */
export function supabaseCrossAppTokenStore(
  supabase: Pick<TypedSupabaseClient, 'rpc'>
): CrossAppTokenStore {
  return {
    async revokeAllForUser(userId) {
      const { error } = await supabase.rpc('revoke_all_cross_app_tokens', {
        p_user_id: userId,
      });
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * Revokes credentials derived from a session that must not outlive its
 * sign-out: AI temp-auth tokens and cross-app handoff tokens. Call it while
 * the session still authorizes the requests. Never throws.
 */
export async function revokeSignOutCredentials(
  userId: string,
  supabase: Pick<TypedSupabaseClient, 'rpc'>
) {
  const [aiTempAuth] = await Promise.allSettled([
    revokeUserAiTempAuthTokens(userId),
    revokeCrossAppTokensForUser(userId, supabaseCrossAppTokenStore(supabase)),
  ]);

  if (aiTempAuth.status === 'rejected') {
    console.error('Failed to revoke AI temp auth tokens', {
      error:
        aiTempAuth.reason instanceof Error
          ? aiTempAuth.reason.message
          : String(aiTempAuth.reason),
    });
  }
}

/** Same as `revokeSignOutCredentials` for the session's own user. */
export async function revokeCurrentUserSignOutCredentials(
  supabase: SessionClient
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) await revokeSignOutCredentials(user.id, supabase);
}
