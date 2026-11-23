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
import { useEffect, useRef, useState } from 'react';
import {
  hashMiraConsentText,
  MIRA_BOX_RECORDS_TRANSCRIPT,
  useMiraConsentText,
} from '../../live-assistant/mira-consent-box';
import { takeMiraJoinChoice } from '../../live-assistant/mira-join-choice';
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

export type RoomMiraAvailable = Extract<RoomMiraConsent, { available: true }>;
type Source = 'join' | 'confirm' | 'toggle';

/**
 * Room Mira state and actions for the caller. A box state remembered at Join
 * is recorded once, right after admission, only when an acceptance was
 * already current; a later acceptance asks the participant to confirm.
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

  // The Join box state applies once, to an acceptance current at admission.
  const applied = useRef(false);
  const [preferOff, setPreferOff] = useState(false);
  useEffect(() => {
    if (applied.current || !query.data) return;
    applied.current = true;
    const remembered = takeMiraJoinChoice(meetingId);
    if (!remembered) return;
    if (!remembered.ticked) setPreferOff(true);
    if (!data?.acceptance || data.choice !== null) return;
    // A workspace that unticks the box by default never counts a box that
    // started ticked on a join screen; the participant confirms instead.
    if (remembered.ticked && !data.boxTickedByDefault) return;
    choose.mutate({
      choice: remembered.ticked ? 'on' : 'off',
      source: 'join',
      textHash: remembered.textHash,
      locale: remembered.locale,
    });
  }, [query.data, data, meetingId, choose]);

  return {
    loading: query.isLoading,
    available: query.data?.available === true,
    data,
    /** Preset for a confirm box: the workspace default unless unticked at Join. */
    presetTicked: !preferOff && (data?.boxTickedByDefault ?? true),
    choose,
    acceptance,
  };
}
