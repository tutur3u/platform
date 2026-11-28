import { requestRequiresAiDataConsent } from '@tuturuuu/utils/ai-consent-session';
import {
  AI_DATA_CONSENT_POLICY_VERSION,
  lookupAiDataConsent,
} from '@tuturuuu/utils/ai-data-consent-store';
import { NextResponse } from 'next/server';

/**
 * Mira AI data consent (Apple 5.1.2(i)). Mira sends a person's text, files,
 * voice, camera and screen content to Google Gemini only after that person
 * allowed it. The decision is stored server-side per user
 * (private.user_ai_data_consent) and defaults to "not allowed".
 *
 * Scope: requests from native apps, which authenticate with a bearer token;
 * app sessions (`ttr_app_*`) whose handoff did not come from a browser cookie
 * session (see @tuturuuu/utils/ai-consent-session); and AI temp-auth tokens
 * minted by such a request (the token validator re-checks consent on every
 * use). Browser sessions (cookie auth) are exempt until the web consent
 * surface ships; see apps/docs/platform/chat-safety-and-ai-consent.mdx.
 */
export { AI_DATA_CONSENT_POLICY_VERSION };
export const AI_CONSENT_REQUIRED_CODE = 'ai_consent_required';

/** Whether [request] comes from a native client that must show consent. */
export function requiresAiDataConsent(request: Request) {
  // Supabase bearer tokens come from native apps. App-coordination tokens
  // (ttr_app_*) follow the web scope unless their session is stamped
  // consent-required because its handoff was not minted from a browser
  // cookie session.
  return requestRequiresAiDataConsent(request);
}

/**
 * True only when the user's stored decision is "allowed". A failed lookup is
 * treated as no consent, so an outage never sends data without permission.
 */
export async function hasAiDataConsent(
  userId: string,
  admin?: unknown
): Promise<boolean> {
  return lookupAiDataConsent(userId, admin);
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
