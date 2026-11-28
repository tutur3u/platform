import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

/**
 * Mira AI data consent (Apple 5.1.2(i)). Mira sends a person's text, files,
 * voice, camera and screen content to Google Gemini only after that person
 * allowed it. The decision is stored server-side per user
 * (private.user_ai_data_consent) and defaults to "not allowed".
 *
 * Scope: requests from native apps, which authenticate with a bearer token.
 * Browser sessions (cookie auth) are exempt until the web consent surface
 * ships; see apps/docs/platform/chat-safety-and-ai-consent.mdx.
 */
export const AI_DATA_CONSENT_POLICY_VERSION = '2026-11-28';
export const AI_CONSENT_REQUIRED_CODE = 'ai_consent_required';

type PrivateRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

type AdminLike = { schema: (schema: 'private') => PrivateRpcClient };

/** Whether [request] comes from a native client that must show consent. */
export function requiresAiDataConsent(request: Request) {
  const bearer = request.headers
    .get('authorization')
    ?.match(/^Bearer\s+(\S+)/iu)?.[1];
  // Satellite web apps carry first-party app-session tokens (ttr_app_*);
  // they are browser surfaces and follow the web scope.
  return !!bearer && !bearer.startsWith('ttr_app_');
}

/**
 * True only when the user's stored decision is "allowed". A failed lookup is
 * treated as no consent, so an outage never sends data without permission.
 */
export async function hasAiDataConsent(
  userId: string,
  admin?: unknown
): Promise<boolean> {
  try {
    const client = (admin ??
      (await createAdminClient({ noCookie: true }))) as unknown as AdminLike;
    const { data, error } = await client
      .schema('private')
      .rpc('has_ai_data_consent', { p_user_id: userId });
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

export function aiConsentRequiredResponse() {
  return NextResponse.json(
    { code: AI_CONSENT_REQUIRED_CODE, message: AI_CONSENT_REQUIRED_CODE },
    { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

/**
 * Returns a 403 response when [request] needs consent that [userId] hasn't
 * given, otherwise null.
 */
export async function enforceAiDataConsent(
  request: Request,
  userId: string,
  admin?: unknown
): Promise<NextResponse | null> {
  if (!requiresAiDataConsent(request)) return null;
  if (await hasAiDataConsent(userId, admin)) return null;
  return aiConsentRequiredResponse();
}
