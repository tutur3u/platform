'use client';

import { createContext, type ReactNode, useContext } from 'react';
import { type PrejoinCapture, usePrejoinCapture } from './use-prejoin-capture';

/** What the pre-join stage shows before the room has reported anything. */
export type PrejoinInfo = {
  meetingName: string;
  displayName: string;
  avatarUrl?: string;
  leaveHref: string;
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
  const capture = usePrejoinCapture();
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
