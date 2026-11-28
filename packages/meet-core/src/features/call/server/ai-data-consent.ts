import {
  AI_CONSENT_REQUIRED_CODE,
  hasAiDataConsent,
  requiresAiDataConsent,
} from '@tuturuuu/ai/chat/ai-data-consent';
import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';

/**
 * Mira AI data consent (Apple 5.1.2(i)) for Meet routes that send a prompt
 * to Gemini. Native bearer callers, and app sessions stamped consent-required
 * (including the token Web's Meet assistant gateway mints for a native
 * caller), need the user's stored consent; browser sessions are exempt.
 */
export async function requireMeetAiDataConsent(
  request: Request,
  userId: string
) {
  if (!requiresAiDataConsent(request)) return;
  if (await hasAiDataConsent(userId)) return;
  throw new MeetCallAccessError(
    403,
    AI_CONSENT_REQUIRED_CODE,
    AI_CONSENT_REQUIRED_CODE
  );
}
