'use client';
import { useEffect, useRef, useState } from 'react';
import type { MeetRoomController } from '../lib/room-controller';

/** Secondary devices keep video but use the nearby primary device for all audio. */
export function useSharedRoomAudio(room: MeetRoomController) {
  const [shared, setShared] = useState(false);
  const active = useRef(false);
  const mute = () => {
    for (const track of room.localStream?.getAudioTracks() ?? [])
      track.enabled = false;
  };
  useEffect(() => {
    if (shared)
      for (const track of room.localStream?.getAudioTracks() ?? [])
        if (room.media.audioEnabled || track.enabled) track.enabled = false;
  }, [shared, room.localStream, room.media.audioEnabled]);
  const toggle = async () => {
    if (active.current) {
      active.current = false;
      setShared(false);
      // Leaving companion mode never opens the microphone automatically.
      return;
    }
    active.current = true;
    setShared(true);
    mute();
    try {
      if (room.media.audioEnabled) await room.toggleMicrophone();
    } finally {
      if (active.current) mute();
    }
  };
  return { shared, toggle };
}
