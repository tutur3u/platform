'use client';

import type { MiraNoticeMode } from '../../live-assistant/mira-consent-box';
import { readSelfRoom } from '../../meeting-ai/self-room';
import { useTranscriptConsent } from '../../meeting-ai/use-transcript-consent';

/**
 * The Mira notice this meeting shows, from the same room read every
 * transcript surface uses. `known` is true only once that read has
 * succeeded: a failed read is unknown, never room capture, so nothing is
 * shown, hashed or applied under a notice that may be the wrong one. The read
 * retries with a bounded backoff while it fails.
 */
export function useMiraNoticeMode(meetingId: string): {
  mode: MiraNoticeMode;
  known: boolean;
} {
  const { consent } = useTranscriptConsent(meetingId);
  return {
    mode: readSelfRoom(consent).mode,
    known: consent !== undefined,
  };
}
