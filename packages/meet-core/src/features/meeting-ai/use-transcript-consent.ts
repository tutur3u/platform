'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type MeetTranscriptConsent,
  readMeetTranscriptConsent,
  setMeetTranscriptChoice,
} from '@tuturuuu/internal-api';
import { hashMiraConsentText } from '../live-assistant/mira-consent-box';
import {
  classifySelfFailure,
  isStaleSelfNotice,
  setSelfTranscriptChoice,
} from './self-api';
import {
  confirmSelfNotice,
  holdSelfCapture,
  markSelfIneligible,
  releaseSelfCapture,
  selfHoldEpoch,
} from './self-hold';
import { roomMiraConsentKey } from '../call/components/room-mira-key';
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

/** Delays between reads of a room that could not be read. */
export const CONSENT_READ_BACKOFF_MS = [
  2000, 4000, 8000, 16_000, 30_000, 30_000,
];
/** After the backoff, a slow read keeps going so the notice can recover. */
export const CONSENT_READ_SLOW_MS = 60_000;
/** While a transcript runs or the caller still has to choose. */
export const CONSENT_FAST_REFRESH_MS = 5000;
/** After the caller chose and no transcript runs. */
export const CONSENT_SLOW_REFRESH_MS = 20_000;

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
      // A room that could not be read is unknown, never room capture; read
      // it again with a backoff, then slowly.
      if (!data && current.state.status === 'error')
        return (
          CONSENT_READ_BACKOFF_MS[current.state.errorUpdateCount - 1] ??
          CONSENT_READ_SLOW_MS
        );
      if (!data?.available) return false;
      return data.active || data.choice === null
        ? CONSENT_FAST_REFRESH_MS
        : CONSENT_SLOW_REFRESH_MS;
    },
    retry: false,
  });
  const consent = query.data;
  // In a per-speaker meeting the choice goes through the Meet server, which
  // also settles the participant's own legal record.
  const submit = async (
    current: MeetTranscriptConsent | undefined,
    choice: 'allow' | 'decline'
  ): Promise<{ next: MeetTranscriptConsent; perSpeaker: boolean }> => {
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
      return {
        next: isConsentView(next)
          ? next
          : await readMeetTranscriptConsent(meetingId),
        perSpeaker: true,
      };
    }
    return {
      next: await setMeetTranscriptChoice(
        meetingId,
        choice,
        current?.available ? current.version : ''
      ),
      perSpeaker: false,
    };
  };
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: transcriptConsentKey(meetingId),
    });
  const choose = useMutation({
    mutationFn: (choice: 'allow' | 'decline') => submit(consent, choice),
    // A decline stops this device's own capture before the request is sent,
    // and keeps it stopped if the request fails. An Allow remembers the
    // latest hold it follows, so it never undoes a decline made after it.
    onMutate: (choice) =>
      choice === 'decline'
        ? { since: holdSelfCapture(meetingId) }
        : { since: selfHoldEpoch(meetingId) },
    onSuccess: ({ next, perSpeaker }, choice, context) => {
      queryClient.setQueryData(transcriptConsentKey(meetingId), next);
      // Any recorded per-speaker choice answers the notice; only an Allow
      // lifts a hold.
      if (perSpeaker) confirmSelfNotice(meetingId);
      if (choice === 'allow') releaseSelfCapture(meetingId, context?.since);
    },
    onError: (error) => {
      // Someone the server will not let contribute here stops being asked.
      if (classifySelfFailure(error) === 'not_eligible')
        markSelfIneligible(meetingId);
      // The notice changed since it was shown; show the current one. A Mira
      // on for the other notice is asked again in the Mira notice too.
      if (isStaleSelfNotice(error)) {
        void refresh();
        void queryClient.invalidateQueries({
          queryKey: roomMiraConsentKey(meetingId),
        });
      }
    },
  });
  /**
   * Records the caller's Allow on the current notice, so a host who starts
   * at once is never left pending. It always reads the room itself, never a
   * cached or in-flight read that may predate a mode change: a per-speaker
   * meeting asks each person, the host included, in the notice instead, and
   * nothing is released for it.
   */
  const ensureAllowed = async () => {
    const current = await readMeetTranscriptConsent(meetingId);
    queryClient.setQueryData(transcriptConsentKey(meetingId), current);
    if (!current?.available || current.choice === 'allow') return;
    if (readSelfRoom(current).mode === 'self') return;
    const since = selfHoldEpoch(meetingId);
    const { next } = await submit(current, 'allow');
    queryClient.setQueryData(transcriptConsentKey(meetingId), next);
    releaseSelfCapture(meetingId, since);
  };
  return { consent, choose, ensureAllowed, refresh, isError: query.isError };
}
