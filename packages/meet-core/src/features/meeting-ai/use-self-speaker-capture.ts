'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRoomMiraConsent } from '../call/components/use-room-mira';
import { createSelfCaptureApi } from './self-api';
import {
  SELF_IDLE_INPUTS,
  SelfCaptureController,
  type SelfCaptureInputs,
} from './self-controller';
import {
  onSelfCaptureFlags,
  requireSelfNotice,
  selfCaptureFlags,
  useSelfCaptureFlags,
} from './self-hold';
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
}): {
  state: SelfCaptureState;
  room: SelfRoomView;
  /** A transcript session is running in this room. */
  active: boolean;
} {
  const { consent } = useTranscriptConsent(meetingId, inCall);
  const mira = useRoomMiraConsent(meetingId);
  const room = useMemo(() => readSelfRoom(consent), [consent]);
  const allow = !!consent?.available && consent.choice === 'allow';
  const miraOn = !!mira.data?.available && mira.data.choice === 'on';
  // Re-renders on any local fence change; the effects read them fresh.
  const flags = useSelfCaptureFlags(meetingId);
  // A reconnect is a rejoin: a stream refused before it may open again.
  const [epoch, setEpoch] = useState(0);
  const [wasConnected, setWasConnected] = useState(connected);
  if (wasConnected !== connected) {
    setWasConnected(connected);
    if (connected) setEpoch((value) => value + 1);
  }
  const controller = useMemo(
    () =>
      new SelfCaptureController({
        api: createSelfCaptureApi(wsId, meetingId),
        onNoticeRequired: () => requireSelfNotice(meetingId),
      }),
    [wsId, meetingId]
  );
  const latest = useRef<SelfCaptureInputs>(SELF_IDLE_INPUTS);
  const sessionId = room.session?.sessionId;
  const protocol = room.session?.protocol;
  // Syncs the capture controller (an external audio resource) with the
  // server's room state; it fetches nothing itself.
  useEffect(() => {
    const local = selfCaptureFlags(meetingId);
    latest.current = {
      mode: room.mode,
      session: sessionId && protocol ? { sessionId, protocol } : null,
      allow,
      miraOn,
      connected: inCall && connected,
      guest,
      stream,
      joinEpoch: epoch,
      held: local.held,
      noticeRequired: local.noticeRequired,
    };
    controller.update(latest.current);
  }, [
    meetingId,
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
    flags,
  ]);
  // A decline or Mira off halts capture in the same task, before React
  // re-renders and before its request leaves the device.
  useEffect(
    () =>
      onSelfCaptureFlags(meetingId, () => {
        const local = selfCaptureFlags(meetingId);
        latest.current = {
          ...latest.current,
          held: local.held,
          noticeRequired: local.noticeRequired,
        };
        controller.update(latest.current);
      }),
    [controller, meetingId]
  );
  useEffect(() => controller.attachUnload(window), [controller]);
  useEffect(() => () => controller.dispose(), [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    () => OFF
  );
  return {
    state,
    room,
    active: !!consent?.available && consent.active,
  };
}
