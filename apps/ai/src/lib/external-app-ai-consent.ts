import { hasAiDataConsent } from '@tuturuuu/ai/chat/ai-data-consent';
import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { AI_CONSENT_REQUIRED_SCOPE } from '@tuturuuu/utils/ai-consent-session';

/**
 * Mira AI data consent: an external-app session stamped consent-required
 * reaches an AI provider only after its user allowed it. API keys and
 * first-party credentials carry no session stamp and pass through.
 */
export async function assertExternalAppAiConsent(credential: {
  actorId: string;
  kind: string;
  scopes?: string[];
}) {
  if (
    credential.kind === 'external-app' &&
    credential.scopes?.includes(AI_CONSENT_REQUIRED_SCOPE) &&
    !(await hasAiDataConsent(credential.actorId))
  ) {
    throw new AiStudioError('ai_consent_required', {
      code: 'ai_consent_required',
      status: 403,
      type: 'permission_error',
    });
  }
}
