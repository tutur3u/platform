'use client';

import { createContext, type ReactNode, useContext } from 'react';
import { guestMediaRequest } from './guest-prejoin-media';
import { type PrejoinCapture, usePrejoinCapture } from './use-prejoin-capture';

/** What the pre-join stage shows before the room has reported anything. */
export type PrejoinInfo = {
  meetingId: string;
  meetingName: string;
  displayName: string;
  avatarUrl?: string;
  leaveHref: string;
  guest?: boolean;
};

type PrejoinValue = { capture: PrejoinCapture; info: PrejoinInfo };

const PrejoinContext = createContext<PrejoinValue | null>(null);

/**
 * Keeps one local preview alive from the first connecting frame through the
 * ready and waiting states, so the camera and microphone choices survive the
 * switch from the device gate to the connected room.
 */
export function PrejoinProvider({
  info,
  children,
}: {
  info: PrejoinInfo;
  children: ReactNode;
}) {
  const capture = usePrejoinCapture(
    info.guest
      ? (guestMediaRequest(info.meetingId)?.preferences ?? {
          audioEnabled: false,
          videoEnabled: false,
          audioDeviceId: '',
          videoDeviceId: '',
          outputDeviceId: '',
        })
      : undefined
  );
  return (
    <PrejoinContext.Provider value={{ capture, info }}>
      {children}
    </PrejoinContext.Provider>
  );
}

/** The shared preview, or null when the redesigned join flow is off. */
export function usePrejoin() {
  return useContext(PrejoinContext)?.capture ?? null;
}

export function usePrejoinInfo() {
  return useContext(PrejoinContext)?.info ?? null;
}

/** True when the redesigned Meet flow is on; the provider only mounts with it. */
export function useMeetUxV2() {
  return useContext(PrejoinContext) !== null;
}
