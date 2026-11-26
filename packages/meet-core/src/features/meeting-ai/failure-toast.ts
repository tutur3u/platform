'use client';
import type { RoomMiraConsent } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { meetingAiRequestFailure } from './request-failure';

type FailureKey = NonNullable<
  ReturnType<typeof meetingAiRequestFailure>['key']
>;
type MiraOffKey = 'failure_mira_off' | 'failure_mira_off_host';

/** Whether room Mira is on, as the caller's room Mira state says. */
export type RoomMiraFailureContext = { on: boolean; canTurnOn: boolean };

/** The room Mira context of a refusal, when the caller's state is known. */
export function roomMiraFailureContext(
  consent: RoomMiraConsent | undefined
): RoomMiraFailureContext | undefined {
  if (!consent?.available) return undefined;
  return { on: !!consent.acceptance, canTurnOn: consent.canAccept };
}

/**
 * A missing Mira choice is worded for the state the person sees: while room
 * Mira is off there is no Confirm in the Mira menu yet, so the host is asked
 * to turn it on first (or, for the host, told to).
 */
function miraConsentKey(
  roomMira: RoomMiraFailureContext | undefined
): 'failure_mira_consent' | MiraOffKey {
  if (!roomMira || roomMira.on) return 'failure_mira_consent';
  return roomMira.canTurnOn ? 'failure_mira_off_host' : 'failure_mira_off';
}

/** Never pass an exception message, response body, identity or URL to the toast/log. */
export function showMeetingAiFailure(
  t: (key: 'failed' | FailureKey | MiraOffKey) => string,
  error: unknown,
  roomMira?: RoomMiraFailureContext
) {
  const { key, status, code } = meetingAiRequestFailure(error);
  console.warn('Meeting AI request failed', { status, code });
  if (key === 'failure_mira_consent') {
    toast.error(t(miraConsentKey(roomMira)));
    return;
  }
  toast.error(t('failed'), { description: key ? t(key) : undefined });
}
