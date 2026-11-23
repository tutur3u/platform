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
import { useEffect, useMemo } from 'react';
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
 * What the join screen shows before admission: the box default and the
 * acceptance revision open now. Cached apart from the in-call state so a
 * pre-admission answer never stands in for it after joining.
 */
export function useRoomMiraJoinSeed(meetingId: string | undefined) {
  const query = useQuery({
    queryKey: [...roomMiraConsentKey(meetingId ?? ''), 'join-default'],
    queryFn: () => readRoomMiraConsent(meetingId!),
    enabled: !!meetingId,
    retry: false,
  });
  const data = query.data;
  const ticked = data?.available ? data.boxTickedByDefault : data?.joinDefault;
  const revision = data?.available
    ? (data.acceptance?.revision ?? 0)
    : (data?.joinRevision ?? 0);
  return useMemo(
    () => (ticked === undefined ? undefined : { ticked, revision }),
    [ticked, revision]
  );
}

export type RoomMiraAvailable = Extract<RoomMiraConsent, { available: true }>;
type Source = 'join' | 'confirm' | 'toggle';

/** Join states being recorded now, shared by every surface in the tab. */
const applying = new Set<string>();
/**
 * Join states whose recording failed, with the read they failed under. They
 * retry on the next read, never in a tight loop.
 */
const failedAt = new Map<string, number>();

/**
 * Room Mira state and actions for the caller. A box state remembered at Join
 * is recorded once, after admission, only for the acceptance revision that
 * was open on the join screen; any other acceptance asks them to confirm.
 * The Join state is never cleared before it is recorded, and every confirm
 * box starts unticked while the participant's own last state is off.
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
    // A Join state is retried quietly on the next read.
    onError: (_error, input) => {
      if (input.source !== 'join') toast.error(t('save_failed'));
    },
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
  const dataUpdatedAt = query.dataUpdatedAt;
  const pendingJoin =
    !!data?.acceptance && data.choice === null
      ? peekMiraJoinChoice(meetingId)
      : null;
  useEffect(() => {
    if (!data?.acceptance || data.choice !== null || !pendingJoin) return;
    const acceptance = data.acceptance;
    const flight = `${meetingId}:${acceptance.revision}`;
    // Only the acceptance that was open on the join screen takes the Join
    // state; any other revision, or one that cannot be compared, asks the
    // participant to confirm. Revisions come from the server, so client clock
    // skew never decides it.
    if (
      pendingJoin.appliedRevision === acceptance.revision ||
      pendingJoin.seenRevision !== acceptance.revision ||
      !/^[0-9a-f]{64}$/.test(pendingJoin.textHash) ||
      applying.has(flight) ||
      failedAt.get(flight) === dataUpdatedAt
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
        onSuccess: () => {
          failedAt.delete(flight);
          markMiraJoinChoiceApplied(meetingId, acceptance.revision);
        },
        onError: () => failedAt.set(flight, dataUpdatedAt),
        onSettled: () => applying.delete(flight),
      }
    );
  }, [data, pendingJoin, meetingId, choose, revision, dataUpdatedAt]);

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
      data?.lastChoice !== 'off' &&
      !prefersMiraOff(meetingId) &&
      (data?.boxTickedByDefault ?? true),
    choose,
    acceptance,
  };
}
