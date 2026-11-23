'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptRoomMira,
  type RoomMiraConsent,
  readRoomMiraConsent,
  reportRoomMiraMinor,
  setMeetTranscriptChoice,
  setRoomMiraChoice,
  turnOffRoomMira,
} from '@tuturuuu/internal-api';
import {
  MEET_TRANSCRIPT_NOTICE_VERSION,
  MIRA_ROOM_NOTICE_VERSION,
} from '@tuturuuu/realtime/meet';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import {
  hashMiraConsentText,
  MIRA_BOX_RECORDS_TRANSCRIPT,
  useMiraConsentText,
} from '../../live-assistant/mira-consent-box';
import {
  markMiraJoinChoiceApplied,
  peekMiraJoinChoice,
  prefersMiraOff,
  rememberMiraPreference,
} from '../../live-assistant/mira-join-choice';
import { transcriptConsentKey } from '../../meeting-ai/use-transcript-consent';

export const roomMiraConsentKey = (meetingId: string) => [
  'room-mira-consent',
  meetingId,
];

/** The caller's room Mira state, shared by every surface in the call. */
export function useRoomMiraConsent(meetingId: string) {
  return useQuery({
    queryKey: roomMiraConsentKey(meetingId),
    queryFn: () => readRoomMiraConsent(meetingId),
    // A pending opt-out settles within the in-flight request.
    refetchInterval: (current) => {
      const data = current.state.data;
      return data?.available && data.pausing ? 2000 : 10_000;
    },
    retry: false,
  });
}

/**
 * The join box default before admission, cached apart from the in-call state
 * so a pre-admission answer never stands in for it after joining.
 */
export function useRoomMiraJoinDefault(meetingId: string | undefined) {
  const query = useQuery({
    queryKey: [...roomMiraConsentKey(meetingId ?? ''), 'join-default'],
    queryFn: () => readRoomMiraConsent(meetingId!),
    enabled: !!meetingId,
    retry: false,
  });
  const data = query.data;
  return data?.available ? data.boxTickedByDefault : data?.joinDefault;
}

export type RoomMiraAvailable = Extract<RoomMiraConsent, { available: true }>;
type Source = 'join' | 'confirm' | 'toggle';

/** Join states being recorded now, shared by every surface in the tab. */
const applying = new Set<string>();

/**
 * Room Mira state and actions for the caller. A box state remembered at Join
 * is recorded once, after admission, only for an acceptance that was already
 * current when the participant pressed Join; a later acceptance asks them to
 * confirm. The Join state is never cleared before it is recorded, and every
 * confirm box starts unticked while the participant's own last state is off.
 */
export function useRoomMira(meetingId: string) {
  const t = useTranslations('meet.mira_consent');
  const queryClient = useQueryClient();
  const text = useMiraConsentText();
  const locale = useLocale();
  const query = useRoomMiraConsent(meetingId);
  const data = query.data?.available ? query.data : undefined;
  const save = (next: RoomMiraConsent) =>
    queryClient.setQueryData(roomMiraConsentKey(meetingId), next);
  const refreshTranscript = () =>
    void queryClient.invalidateQueries({
      queryKey: transcriptConsentKey(meetingId),
    });

  const choose = useMutation({
    mutationFn: async (input: {
      choice: 'on' | 'off';
      source: Source;
      textHash?: string;
      locale?: string;
    }) =>
      setRoomMiraChoice(meetingId, {
        choice: input.choice,
        version: MIRA_ROOM_NOTICE_VERSION,
        acceptanceRevision: data?.acceptance?.revision ?? 0,
        source: input.source,
        textHash: input.textHash ?? (await hashMiraConsentText(text)),
        locale: input.locale ?? locale,
      }),
    onSuccess: async (next, input) => {
      save(next);
      rememberMiraPreference(meetingId, input.choice === 'on');
      // Off declines the transcript in the room itself; on also allows it
      // while the box covers the live transcript.
      if (
        input.choice === 'on' &&
        MIRA_BOX_RECORDS_TRANSCRIPT &&
        next.available &&
        next.choice === 'on'
      )
        await setMeetTranscriptChoice(
          meetingId,
          'allow',
          MEET_TRANSCRIPT_NOTICE_VERSION
        ).catch(() => undefined);
      refreshTranscript();
    },
    onError: () => toast.error(t('save_failed')),
  });

  const acceptance = useMutation({
    mutationFn: (action: 'accept' | 'turn_off' | 'report') =>
      action === 'accept'
        ? acceptRoomMira(meetingId, ['chat', 'captions', 'notes'])
        : action === 'turn_off'
          ? turnOffRoomMira(meetingId)
          : reportRoomMiraMinor(meetingId),
    onSuccess: (next) => {
      save(next);
      refreshTranscript();
    },
    onError: () => toast.error(t('host_failed')),
  });

  // The Join box state applies once, to an acceptance current at Join.
  const revision = data?.acceptance?.revision;
  const pendingJoin =
    !!data?.acceptance && data.choice === null
      ? peekMiraJoinChoice(meetingId)
      : null;
  useEffect(() => {
    if (!data?.acceptance || data.choice !== null || !pendingJoin) return;
    const acceptance = data.acceptance;
    const flight = `${meetingId}:${acceptance.revision}`;
    if (
      pendingJoin.appliedRevision === acceptance.revision ||
      !/^[0-9a-f]{64}$/.test(pendingJoin.textHash) ||
      acceptance.acceptedAt > pendingJoin.joinedAt ||
      applying.has(flight)
    )
      return;
    // A workspace that unticks the box by default never counts a box that
    // started ticked on a join screen; the participant confirms instead.
    if (pendingJoin.ticked && !data.boxTickedByDefault) return;
    applying.add(flight);
    choose.mutate(
      {
        choice: pendingJoin.ticked ? 'on' : 'off',
        source: 'join',
        textHash: pendingJoin.textHash,
        locale: pendingJoin.locale,
      },
      {
        onSuccess: () =>
          markMiraJoinChoiceApplied(meetingId, acceptance.revision),
        onSettled: () => applying.delete(flight),
      }
    );
  }, [data, pendingJoin, meetingId, choose, revision]);

  return {
    loading: query.isLoading,
    available: query.data?.available === true,
    data,
    /**
     * Preset for a confirm box: unticked while the participant's own last
     * state is off, else the workspace default.
     */
    presetTicked: () =>
      data?.choice !== 'off' &&
      !prefersMiraOff(meetingId) &&
      (data?.boxTickedByDefault ?? true),
    choose,
    acceptance,
  };
}
