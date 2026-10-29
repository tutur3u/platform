'use client';

import { useEffect, useState } from 'react';
import type { MeetRoomController } from '../../call/lib/room-controller';
import { TranscriptionConsentDialog } from './consent-dialog';
import { useTranscriptionCues } from './transcription-cues';
import { TranscriptionPill } from './transcription-pill';
import type { TranscriptionConsent } from './use-transcription-consent';

type Room = Pick<
  MeetRoomController,
  'state' | 'connectionStatus' | 'announceTranscription'
>;

/**
 * The host's capture state is the source of truth: announce it to the room so
 * every admitted participant sees the indicator and the consent prompt.
 */
function useTranscriptionBroadcast(room: Room, sessionId: string | undefined) {
  const { state, connectionStatus, announceTranscription } = room;
  const live = state.transcription.state;
  const selfUserId = state.selfUserId;
  const canAnnounce =
    state.role === 'host' && !!selfUserId && connectionStatus === 'open';
  useEffect(() => {
    if (!canAnnounce || !selfUserId) return;
    if (sessionId) {
      if (live?.active && live.sessionId === sessionId) return;
      announceTranscription({
        active: true,
        sessionId,
        startedBy: selfUserId,
        language: 'auto',
        consentRequired: true,
      });
    } else if (live?.active && live.startedBy === selfUserId) {
      announceTranscription({ ...live, active: false });
    }
  }, [canAnnounce, selfUserId, sessionId, live, announceTranscription]);
}

export function TranscriptionLayer({
  consent,
  room,
  capturingSessionId,
  onOpenRoster,
}: {
  consent: TranscriptionConsent;
  room: Room;
  /** The meet_ai_sessions id this device is capturing, if any. */
  capturingSessionId?: string;
  onOpenRoster: () => void;
}) {
  useTranscriptionBroadcast(room, capturingSessionId);
  useTranscriptionCues(consent.active);
  const [manual, setManual] = useState(false);
  const [deferred, setDeferred] = useState<string | null>(null);
  const prompt =
    consent.active &&
    !consent.isStarter &&
    consent.selfDecision === undefined &&
    deferred !== consent.sessionId;
  const open = consent.active && !consent.isStarter && (manual || prompt);
  const host = consent.startedBy
    ? room.state.participants[consent.startedBy]?.displayName
    : undefined;
  return (
    <>
      <TranscriptionPill
        consent={consent}
        onOpen={() => (consent.isStarter ? onOpenRoster() : setManual(true))}
      />
      <TranscriptionConsentDialog
        consent={consent}
        open={open}
        onOpenChange={(next) => {
          if (next) return;
          setManual(false);
          setDeferred(consent.sessionId);
        }}
        hostName={host}
      />
    </>
  );
}
