import 'server-only';

import {
  AI_CONSENT_REQUIRED_CODE,
  hasAiDataConsent,
  requiresAiDataConsent,
} from '@tuturuuu/ai/chat/ai-data-consent';
import { MeetAiError } from './access';

/**
 * Mira AI data consent (Apple 5.1.2(i)) for meeting transcription and notes,
 * which send audio and transcripts to Gemini. A native caller without stored
 * consent gets a 403 `ai_consent_required`; browser sessions are exempt.
 */
export async function requireMeetTranscriptAiConsent(
  request: Request,
  userId: string
) {
  if (!requiresAiDataConsent(request)) return;
  if (await hasAiDataConsent(userId)) return;
  throw new MeetAiError(
    403,
    AI_CONSENT_REQUIRED_CODE,
    AI_CONSENT_REQUIRED_CODE
  );
}

/** The consent check a Meet AI route passes to its feature handler. */
export function meetTranscriptAiConsent(request: Request) {
  return (userId: string) => requireMeetTranscriptAiConsent(request, userId);
}
