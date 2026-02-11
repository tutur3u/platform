'use client';

import { createContext, useContext } from 'react';

export type BoardBroadcastFn = (
  event: string,
  payload: Record<string, unknown>
) => void;

const BoardBroadcastContext = createContext<BoardBroadcastFn | null>(null);

export const BoardBroadcastProvider = BoardBroadcastContext.Provider;

export function useBoardBroadcast(): BoardBroadcastFn | null {
  return useContext(BoardBroadcastContext);
}

// Module-level broadcast ref for components outside the BoardBroadcastProvider
// tree (e.g. task dialog rendered at layout level). Only one board is active
// at a time, so a singleton is safe.
let _activeBroadcast: BoardBroadcastFn | null = null;

export function setActiveBroadcast(fn: BoardBroadcastFn | null) {
  _activeBroadcast = fn;
}

export function getActiveBroadcast(): BoardBroadcastFn | null {
  return _activeBroadcast;
}
