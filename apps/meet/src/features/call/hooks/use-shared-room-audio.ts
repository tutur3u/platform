'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioOverlapMonitor } from '../lib/audio-overlap-monitor';
import type { MeetRoomController } from '../lib/room-controller';
import {
  existingAccountAudio,
  overlapPairKey,
  overlapPeers,
} from '../lib/shared-audio-policy';

export type AudioProtectionReason =
  | 'overlap'
  | 'another-device'
  | 'disconnected';
type Mode = 'own' | 'protected' | 'shared';
interface Protection {
  mode: Mode;
  reason?: AudioProtectionReason;
  peerId?: string;
  peerName?: string;
}

/** Local echo protection pauses capture before suggesting a shared audio device. */
export function useSharedRoomAudio(room: MeetRoomController, active = true) {
  const [protection, setProtection] = useState<Protection>({ mode: 'own' });
  const protectionRef = useRef(protection);
  const roomRef = useRef(room);
  roomRef.current = room;
  const [open, setOpen] = useState(false);
  const [automaticSuggestion, setAutomaticSuggestion] = useState(false);
  const monitor = useRef<AudioOverlapMonitor | null>(null);
  const ignoredPairs = useRef(new Map<string, string>());
  const ignoredAccounts = useRef(new Set<string>());

  const change = useCallback((next: Protection) => {
    protectionRef.current = next;
    setProtection(next);
  }, []);
  const mute = useCallback(() => {
    for (const track of roomRef.current.localStream?.getAudioTracks() ?? [])
      track.enabled = false;
    return roomRef.current.muteMicrophone();
  }, []);
  const protect = useCallback(
    (peerId: string, reason: AudioProtectionReason) => {
      if (protectionRef.current.mode === 'protected') return;
      change({
        mode: 'protected',
        peerId,
        reason,
        peerName:
          roomRef.current.state.participants[peerId]?.displayName ??
          protectionRef.current.peerName,
      });
      void mute().catch(() => undefined);
      setAutomaticSuggestion(true);
      setOpen(true);
    },
    [change, mute]
  );

  const candidates = useCallback(() => {
    const current = roomRef.current;
    const local = current.localStream?.getAudioTracks()[0];
    return overlapPeers(current.state, current.remoteMedia).filter(
      (peer) =>
        !ignoredAccounts.current.has(peer.userId) &&
        ignoredPairs.current.get(peer.userId) !==
          overlapPairKey(local, peer.track)
    );
  }, []);

  useEffect(() => {
    if (!active || protection.mode !== 'own' || !room.media.audioEnabled)
      return;
    const observer = new AudioOverlapMonitor(({ userId }) =>
      protect(userId, 'overlap')
    );
    monitor.current = observer;
    observer.start();
    observer.update(
      roomRef.current.localStream?.getAudioTracks()[0],
      candidates()
    );
    return () => {
      observer.stop();
      monitor.current = null;
    };
  }, [active, protection.mode, room.media.audioEnabled, candidates, protect]);

  useEffect(() => {
    monitor.current?.update(
      room.localStream?.getAudioTracks()[0],
      candidates()
    );
  });

  useEffect(() => {
    if (!active) return;
    if (protection.mode !== 'own') {
      const tracks = room.localStream?.getAudioTracks() ?? [];
      if (room.media.audioEnabled || tracks.some((track) => track.enabled))
        void mute().catch(() => undefined);
      return;
    }
    if (!room.media.audioEnabled) return;
    const duplicate = existingAccountAudio(room.state);
    if (duplicate && !ignoredAccounts.current.has(duplicate.userId))
      protect(duplicate.userId, 'another-device');
  }, [
    active,
    protection.mode,
    room.localStream,
    room.media.audioEnabled,
    room.state,
    mute,
    protect,
  ]);

  useEffect(() => {
    if (
      active &&
      protection.mode === 'shared' &&
      protection.peerId &&
      room.connectionStatus === 'open' &&
      !room.state.participants[protection.peerId]
    )
      protect(protection.peerId, 'disconnected');
  }, [
    active,
    protection,
    room.connectionStatus,
    room.state.participants,
    protect,
  ]);

  const prepareJoin = useCallback(
    (requestedMicrophone: boolean) => {
      if (!requestedMicrophone) return false;
      const duplicate = existingAccountAudio(roomRef.current.state, true);
      if (!duplicate) return true;
      protect(duplicate.userId, 'another-device');
      return false;
    },
    [protect]
  );

  const share = useCallback(async () => {
    change({ ...protectionRef.current, mode: 'shared' });
    setOpen(false);
    try {
      await mute();
    } finally {
      if (protectionRef.current.mode === 'shared')
        for (const track of roomRef.current.localStream?.getAudioTracks() ?? [])
          track.enabled = false;
    }
  }, [change, mute]);

  const useOwnMicrophone = useCallback(async () => {
    const current = roomRef.current;
    const local = current.localStream?.getAudioTracks()[0];
    for (const peer of overlapPeers(current.state, current.remoteMedia))
      ignoredPairs.current.set(peer.userId, overlapPairKey(local, peer.track));
    const duplicate = existingAccountAudio(current.state, true);
    if (duplicate) ignoredAccounts.current.add(duplicate.userId);
    change({ mode: 'own' });
    setOpen(false);
    // Only this explicit user action opens the mic; dismissing a suggestion never does.
    await current.unmuteMicrophone();
  }, [change]);

  return {
    ...protection,
    open,
    automaticSuggestion,
    setOpen: (next: boolean) => {
      if (next) setAutomaticSuggestion(false);
      setOpen(next);
    },
    prepareJoin,
    share,
    useOwnMicrophone,
    shared: protection.mode === 'shared',
    microphonePaused: protection.mode !== 'own',
  };
}
