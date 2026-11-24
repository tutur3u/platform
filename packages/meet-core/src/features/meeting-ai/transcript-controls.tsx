'use client';

import { useMemo } from 'react';
import { useSelfSpeakerCapture } from './use-self-speaker-capture';
import { TranscriptConsentNotice } from './transcript-consent-notice';

type Participants = Record<
  string,
  { accountId?: string; displayName?: string }
>;

/**
 * Header controls for the live transcript: the consent indicator and, in a
 * per-speaker meeting, this participant's own capture of their microphone.
 */
export function TranscriptControls({
  room,
  meetingId,
  wsId,
  guest,
}: {
  room: {
    /** The local call stream; the only audio per-speaker capture can tap. */
    localStream: MediaStream | null;
    connectionStatus: string;
    state: { participants: Participants };
  };
  meetingId: string;
  wsId: string;
  guest: boolean;
}) {
  const participants = room.state.participants;
  const { state } = useSelfSpeakerCapture({
    wsId,
    meetingId,
    stream: room.localStream,
    connected: room.connectionStatus === 'open',
    guest,
    inCall: true,
  });
  const names = useMemo(
    () =>
      Object.fromEntries(
        Object.values(participants).flatMap((person) =>
          person.accountId && person.displayName
            ? [[person.accountId, person.displayName]]
            : []
        )
      ),
    [participants]
  );
  return (
    <TranscriptConsentNotice
      meetingId={meetingId}
      wsId={wsId}
      capture={state}
      names={names}
    />
  );
}
