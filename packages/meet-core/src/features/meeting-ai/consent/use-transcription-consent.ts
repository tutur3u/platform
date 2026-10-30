'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMeetAiConsents,
  getMeetAiOwnConsent,
  recordMeetAiConsent,
} from '@tuturuuu/internal-api';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { useMemo } from 'react';
import type { MeetRoomController } from '../../call/lib/room-controller';
import {
  effectiveSelfDecision,
  isNoticeOutdated,
  type OwnConsent,
} from './effective-decision';
import { MEET_CONSENT_NOTICE_VERSION } from './notice';

export type TranscriptionBadgeState = 'transcribed' | 'excluded' | 'pending';

const NO_DECISIONS: Record<string, string> = {};

/**
 * Consent view for one call. Hosts read the legal roster from the database,
 * keyed by account, which is the same record the chunk endpoint enforces.
 * Participants know their own live decision from the room.
 */
export function useTranscriptionConsent({
  wsId,
  meetingId,
  room,
}: {
  wsId: string;
  meetingId: string;
  room: Pick<MeetRoomController, 'state' | 'sendTranscriptionConsent'>;
}) {
  const { state } = room;
  const live = state.transcription.state;
  const active = live?.active === true;
  const sessionId = active ? live.sessionId : null;
  const selfUserId = state.selfUserId;
  const isStarter = active && !!selfUserId && live.startedBy === selfUserId;
  const roomDecision = selfUserId
    ? state.transcription.consents[selfUserId]
    : undefined;
  const queryClient = useQueryClient();
  // The legal record decides for participants; the room only mirrors it.
  const ownKey = ['meet-ai-consent-self', wsId, meetingId, sessionId] as const;
  const own = useQuery({
    queryKey: ownKey,
    queryFn: () => getMeetAiOwnConsent(wsId, meetingId, sessionId!),
    enabled: !!sessionId && !isStarter,
    refetchInterval: 10_000,
    retry: false,
  });
  const selfDecision = isStarter
    ? roomDecision
    : effectiveSelfDecision(roomDecision, own.data);
  const outdated = isNoticeOutdated(own.data, MEET_CONSENT_NOTICE_VERSION);
  // Live decisions reach the host first; refetch the record as soon as they do.
  const signal = JSON.stringify(state.transcription.consents);
  const roster = useQuery({
    queryKey: ['meet-ai-consent', wsId, meetingId, sessionId, signal],
    queryFn: () => getMeetAiConsents(wsId, meetingId, sessionId!),
    enabled: isStarter && !!sessionId,
    refetchInterval: 5000,
    // Keep the roster across refetches, never across sessions.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === sessionId ? previous : undefined,
    retry: false,
  });
  const decisions = useMemo<Record<string, string>>(
    () => (isStarter ? (roster.data?.decisions ?? NO_DECISIONS) : NO_DECISIONS),
    [isStarter, roster.data]
  );
  const allowedAccountIds = useMemo(
    () =>
      new Set(
        Object.entries(decisions)
          .filter(([, decision]) => decision === 'allow')
          .map(([account]) => account)
      ),
    [decisions]
  );
  const decide = useMutation({
    mutationFn: async (allowed: boolean) => {
      if (!sessionId || !selfUserId) throw new Error('transcription_inactive');
      // The legal record is written first; the room only mirrors it.
      await recordMeetAiConsent(wsId, meetingId, {
        sessionId,
        decision: allowed ? 'allow' : selfDecision ? 'withdraw' : 'deny',
        noticeVersion: MEET_CONSENT_NOTICE_VERSION,
      });
      queryClient.setQueryData<OwnConsent>(ownKey, {
        available: true,
        noticeVersion: MEET_CONSENT_NOTICE_VERSION,
        decision: allowed ? 'allow' : selfDecision ? 'withdraw' : 'deny',
      });
      room.sendTranscriptionConsent(selfUserId, allowed);
    },
    retry: false,
  });

  const badgeFor = (
    participant: MeetRealtimePresence
  ): TranscriptionBadgeState | undefined => {
    if (!active) return undefined;
    if (participant.userId === live?.startedBy)
      return state.transcription.consents[participant.userId] === false
        ? 'excluded'
        : 'transcribed';
    if (participant.userId === selfUserId)
      return selfDecision === undefined
        ? 'pending'
        : selfDecision
          ? 'transcribed'
          : 'excluded';
    if (!isStarter) return undefined;
    const decision = participant.accountId
      ? decisions[participant.accountId]
      : undefined;
    return decision === 'allow'
      ? 'transcribed'
      : decision
        ? 'excluded'
        : 'pending';
  };

  return {
    active,
    sessionId,
    startedBy: active ? live.startedBy : null,
    isStarter,
    selfDecision,
    /** The server shows another notice than this bundle: reload to decide. */
    outdated,
    /** Server notice version, so a decision deferred under an old one resets. */
    noticeVersion: own.data?.noticeVersion ?? null,
    selfAllowed: !(isStarter && selfDecision === false),
    allowedAccountIds,
    rosterAvailable: roster.data?.available ?? true,
    decide,
    badgeFor,
  };
}

export type TranscriptionConsent = ReturnType<typeof useTranscriptionConsent>;
