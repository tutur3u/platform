'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type MeetTranscriptConsent,
  readMeetTranscriptConsent,
  setMeetTranscriptChoice,
} from '@tuturuuu/internal-api';
import { hashMiraConsentText } from '../live-assistant/mira-consent-box';
import { setSelfTranscriptChoice } from './self-api';
import { holdSelfCapture, releaseSelfCapture } from './self-hold';
import { readSelfRoom } from './self-room';

export const transcriptConsentKey = (meetingId: string) => [
  'meet-transcript-consent',
  meetingId,
];

/**
 * Where a per-speaker choice is recorded and the notice the person saw. A
 * per-speaker Allow is refused without the shown notice text.
 */
export type SelfChoiceContext = {
  wsId: string;
  noticeText?: string;
  locale?: string;
};

const isConsentView = (value: unknown): value is MeetTranscriptConsent =>
  typeof value === 'object' &&
  value !== null &&
  'available' in value &&
  typeof value.available === 'boolean';

/**
 * The caller's own live transcript choice and the room's aggregate fence.
 * Refreshes quickly only while a session runs or a choice is still needed.
 */
export function useTranscriptConsent(
  meetingId: string,
  enabled = true,
  self?: SelfChoiceContext
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
    if (self && readSelfRoom(current).mode === 'self') {
      if (!current?.available) throw new Error('The transcript is unavailable');
      // An Allow is only valid for the notice the person saw; a decline is
      // always recorded.
      if (choice === 'allow' && !self.noticeText)
        throw new Error('The per-speaker notice was not shown');
      const next = await setSelfTranscriptChoice(self.wsId, meetingId, {
        choice,
        noticeVersion: current.version,
        locale: self.locale ?? 'en',
        textHash: await hashMiraConsentText(self.noticeText ?? ''),
      });
      return isConsentView(next) ? next : readMeetTranscriptConsent(meetingId);
    }
    return setMeetTranscriptChoice(
      meetingId,
      choice,
      current?.available ? current.version : ''
    );
  };
  const choose = useMutation({
    mutationFn: (choice: 'allow' | 'decline') => submit(consent, choice),
    // A decline stops this device's own capture before the request is sent,
    // and keeps it stopped if the request fails.
    onMutate: (choice) => {
      if (choice === 'decline') holdSelfCapture(meetingId);
    },
    onSuccess: (next: MeetTranscriptConsent, choice) => {
      queryClient.setQueryData(transcriptConsentKey(meetingId), next);
      if (choice === 'allow') releaseSelfCapture(meetingId);
    },
  });
  /**
   * Records the caller's Allow on the current notice, reading it first when
   * it has not loaded, so a host who starts at once is never left pending.
   * A per-speaker meeting asks each person, the host included, in the
   * notice instead.
   */
  const ensureAllowed = async () => {
    const current: MeetTranscriptConsent | undefined =
      consent ??
      (await queryClient.fetchQuery<MeetTranscriptConsent>({
        queryKey: transcriptConsentKey(meetingId),
        queryFn: () => readMeetTranscriptConsent(meetingId),
      }));
    if (!current?.available || current.choice === 'allow') return;
    if (readSelfRoom(current).mode === 'self') return;
    const next = await submit(current, 'allow');
    queryClient.setQueryData(transcriptConsentKey(meetingId), next);
    releaseSelfCapture(meetingId);
  };
  return { consent, choose, ensureAllowed, isError: query.isError };
}
