'use client';

import { readSelfRoom } from './self-room';
import { useTranscriptConsent } from './use-transcript-consent';

/**
 * The room-derived inputs of `useMeetingAi`: whether everyone present has
 * allowed room capture, and which capture mode the room runs.
 */
export function useMeetingAiSettings(meetingId: string, enabled: boolean) {
  const { consent } = useTranscriptConsent(meetingId, enabled);
  return {
    consentReady: !!consent?.available && consent.fence.ready,
    captureMode: readSelfRoom(consent).mode,
  };
}
