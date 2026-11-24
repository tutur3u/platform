'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRoomMiraConsent } from '../call/components/use-room-mira';
import { createSelfCaptureApi } from './self-api';
import { SelfCaptureController } from './self-controller';
import type { SelfCaptureState } from './self-lifecycle';
import { readSelfRoom, type SelfRoomView } from './self-room';
import { useTranscriptConsent } from './use-transcript-consent';

const OFF: SelfCaptureState = { kind: 'off' };

/**
 * Runs per-speaker capture for the local microphone of this call. It does
 * nothing unless the server reports a per-speaker session and this
 * participant has allowed it; room capture never goes through here.
 */
export function useSelfSpeakerCapture({
  wsId,
  meetingId,
  stream,
  connected,
  guest,
  inCall,
}: {
  wsId: string;
  meetingId: string;
  stream: MediaStream | null;
  connected: boolean;
  guest: boolean;
  inCall: boolean;
}): { state: SelfCaptureState; room: SelfRoomView } {
  const { consent } = useTranscriptConsent(meetingId, inCall);
  const mira = useRoomMiraConsent(meetingId);
  const room = useMemo(() => readSelfRoom(consent), [consent]);
  const allow = !!consent?.available && consent.choice === 'allow';
  const miraOn = !!mira.data?.available && mira.data.choice === 'on';
  // A reconnect is a rejoin: a stream refused before it may open again.
  const [epoch, setEpoch] = useState(0);
  const [wasConnected, setWasConnected] = useState(connected);
  if (wasConnected !== connected) {
    setWasConnected(connected);
    if (connected) setEpoch((value) => value + 1);
  }
  const controller = useMemo(
    () =>
      new SelfCaptureController({ api: createSelfCaptureApi(wsId, meetingId) }),
    [wsId, meetingId]
  );
  const sessionId = room.session?.sessionId;
  const protocol = room.session?.protocol;
  useEffect(() => {
    controller.update({
      mode: room.mode,
      session: sessionId && protocol ? { sessionId, protocol } : null,
      allow,
      miraOn,
      connected: inCall && connected,
      guest,
      stream,
      joinEpoch: epoch,
    });
  }, [
    controller,
    room.mode,
    sessionId,
    protocol,
    allow,
    miraOn,
    inCall,
    connected,
    guest,
    stream,
    epoch,
  ]);
  useEffect(() => () => controller.dispose(), [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    () => OFF
  );
  return { state, room };
}
