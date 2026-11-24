'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type MeetTranscriptConsent,
  readMeetTranscriptConsent,
  setMeetTranscriptChoice,
} from '@tuturuuu/internal-api';
import { setSelfTranscriptChoice } from './self-api';
import { readSelfRoom } from './self-room';

export const transcriptConsentKey = (meetingId: string) => [
  'meet-transcript-consent',
  meetingId,
];

/**
 * The caller's own live transcript choice and the room's aggregate fence.
 * Refreshes quickly only while a session runs or a choice is still needed.
 */
export function useTranscriptConsent(
  meetingId: string,
  enabled = true,
  wsId?: string
) {
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
  // In a per-speaker meeting the choice goes through the Meet server, which
  // also settles the participant's own legal record.
  const submit = async (
    current: MeetTranscriptConsent | undefined,
    choice: 'allow' | 'decline'
  ): Promise<MeetTranscriptConsent> => {
    if (wsId && readSelfRoom(current).mode === 'self') {
      const next = await setSelfTranscriptChoice(wsId, meetingId, choice);
      if (
        typeof next === 'object' &&
        next !== null &&
        'available' in next &&
        typeof next.available === 'boolean'
      )
        return next as MeetTranscriptConsent;
      return readMeetTranscriptConsent(meetingId);
    }
    return setMeetTranscriptChoice(
      meetingId,
      choice,
      current?.available ? current.version : ''
    );
  };
  const choose = useMutation({
    mutationFn: (choice: 'allow' | 'decline') => submit(consent, choice),
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
    const next = await submit(current, 'allow');
    queryClient.setQueryData(transcriptConsentKey(meetingId), next);
  };
  return { consent, choose, ensureAllowed, isError: query.isError };
}
