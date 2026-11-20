import 'server-only';

import { createHash } from 'node:crypto';
import {
  isTurnstileError,
  verifyTurnstileToken,
} from '@tuturuuu/cloudflare/turnstile/server';
import { MeetCallAccessError } from '../../lib/call-access';
import type { FormAccess } from './policy';

const ACTION = 'meet_form_submit';

export function formChallenge(
  meeting: Pick<FormAccess['meeting'], 'id' | 'ws_id'>,
  reference: { launchId: string; formId: string; versionId: string },
  policyRevision: string
) {
  const cData = createHash('sha256')
    .update(
      JSON.stringify([
        ACTION,
        meeting.ws_id,
        meeting.id,
        reference.launchId,
        reference.formId,
        reference.versionId,
        policyRevision,
      ])
    )
    .digest('hex');
  return { action: ACTION, cData };
}

export async function verifyFormSubmissionGate(
  request: Request,
  challenge: ReturnType<typeof formChallenge> | null,
  token?: string,
  verify = verifyTurnstileToken
) {
  if (!challenge) return 'exempt' as const;
  const hostname =
    process.env.MEET_FORMS_TURNSTILE_HOSTNAME?.trim().toLowerCase();
  if (!hostname || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(hostname))
    throw new MeetCallAccessError(503, 'Turnstile is unavailable');
  try {
    await verify(request, token, {
      devMode: false,
      expectedHostname: hostname,
      expectedAction: challenge.action,
      expectedCData: challenge.cData,
    });
    return 'verified' as const;
  } catch (error) {
    if (!isTurnstileError(error)) throw error;
    if (error.code === 'not_configured')
      throw new MeetCallAccessError(503, 'Turnstile is unavailable');
    throw new MeetCallAccessError(
      400,
      'Turnstile verification is required',
      'TURNSTILE_REQUIRED'
    );
  }
}
