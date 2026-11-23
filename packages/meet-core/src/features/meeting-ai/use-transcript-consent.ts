'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type MeetTranscriptConsent,
  readMeetTranscriptConsent,
  setMeetTranscriptChoice,
} from '@tuturuuu/internal-api';

export const transcriptConsentKey = (meetingId: string) => [
  'meet-transcript-consent',
  meetingId,
];

/**
 * The caller's own live transcript choice and the room's aggregate fence.
 * Refreshes quickly only while a session runs or a choice is still needed.
 */
export function useTranscriptConsent(meetingId: string, enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: transcriptConsentKey(meetingId),
    queryFn: () => readMeetTranscriptConsent(meetingId),
    enabled,
    refetchInterval: (current) => {
      const data = current.state.data;
      if (!data?.available) return false;
      return data.active || data.choice === null ? 5000 : 20_000;
    },
    retry: false,
  });
  const consent = query.data;
  const choose = useMutation({
    mutationFn: (choice: 'allow' | 'decline') =>
      setMeetTranscriptChoice(
        meetingId,
        choice,
        consent?.available ? consent.version : ''
      ),
    onSuccess: (next: MeetTranscriptConsent) =>
      queryClient.setQueryData(transcriptConsentKey(meetingId), next),
  });
  /**
   * Records the caller's Allow on the current notice, reading it first when
   * it has not loaded, so a host who starts at once is never left pending.
   */
  const ensureAllowed = async () => {
    const current: MeetTranscriptConsent | undefined =
      consent ??
      (await queryClient.fetchQuery<MeetTranscriptConsent>({
        queryKey: transcriptConsentKey(meetingId),
        queryFn: () => readMeetTranscriptConsent(meetingId),
      }));
    if (!current?.available || current.choice === 'allow') return;
    const next = await setMeetTranscriptChoice(
      meetingId,
      'allow',
      current.version
    );
    queryClient.setQueryData(transcriptConsentKey(meetingId), next);
  };
  return { consent, choose, ensureAllowed, isError: query.isError };
}
