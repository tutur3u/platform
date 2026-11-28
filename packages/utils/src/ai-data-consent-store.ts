import { createAdminClient } from '@tuturuuu/supabase/next/server';

/**
 * Mira AI data consent (Apple 5.1.2(i)) storage lookup. The decision lives in
 * private.user_ai_data_consent and only counts for the current policy version,
 * so a new disclosure asks again. `@tuturuuu/ai/chat/ai-data-consent` owns the
 * request-level gate; this module is the framework-free lookup it shares with
 * the AI temp-auth token validator.
 */
export const AI_DATA_CONSENT_POLICY_VERSION = '2026-11-28';

type PrivateRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

type AdminLike = { schema: (schema: 'private') => PrivateRpcClient };

/**
 * True only when the user's stored decision is "allowed" for the current
 * policy version. A failed lookup is treated as no consent, so an outage never
 * sends data without permission.
 */
export async function lookupAiDataConsent(
  userId: string,
  admin?: unknown
): Promise<boolean> {
  try {
    const client = (admin ??
      (await createAdminClient({ noCookie: true }))) as unknown as AdminLike;
    const { data, error } = await client
      .schema('private')
      .rpc('has_ai_data_consent', {
        p_user_id: userId,
        p_policy_version: AI_DATA_CONSENT_POLICY_VERSION,
      });
    if (error) {
      console.error('AI data consent lookup failed', { code: error.code });
      return false;
    }
    return data === true;
  } catch (error) {
    console.error('AI data consent lookup failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}
