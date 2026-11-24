'use client';

import type { MiraNoticeMode } from '../../live-assistant/mira-consent-box';
import { readSelfRoom } from '../../meeting-ai/self-room';
import { useTranscriptConsent } from '../../meeting-ai/use-transcript-consent';

/**
 * The Mira notice this meeting shows, from the same room read every
 * transcript surface uses. `known` stays false until that read settles, so
 * nothing is recorded under a notice the person may not have seen.
 */
export function useMiraNoticeMode(meetingId: string): {
  mode: MiraNoticeMode;
  known: boolean;
} {
  const { consent, isError } = useTranscriptConsent(meetingId);
  return {
    mode: readSelfRoom(consent).mode,
    known: consent !== undefined || isError,
  };
}
