'use client';

import { createContext, useContext } from 'react';
import type { BoardTaskActions } from './board-task-actions';
import type { BoardTaskCollection } from './board-task-collection';

/**
 * Lightweight handle to the active board's instant sync. This module imports
 * TanStack DB types only, so flag-off boards never download the library; the
 * runtime lives in the lazily loaded `instant-board-views` chunk.
 */
export interface InstantBoardSync {
  actions: BoardTaskActions;
  boardId: string;
  collection: BoardTaskCollection;
}

const InstantBoardSyncContext = createContext<InstantBoardSync | null>(null);

export const InstantBoardSyncProvider = InstantBoardSyncContext.Provider;

/** The active board's instant sync, or null when the pilot flag is off. */
export function useInstantBoardSync() {
  return useContext(InstantBoardSyncContext);
}

// The task dialog renders outside the board tree (see board-broadcast-context),
// so the mounted board also registers its sync here. One board is active.
let activeInstantBoardSync: InstantBoardSync | null = null;

export function setActiveInstantBoardSync(sync: InstantBoardSync | null) {
  activeInstantBoardSync = sync;
}

export function getActiveInstantBoardSync(boardId: string) {
  return activeInstantBoardSync?.boardId === boardId
    ? activeInstantBoardSync
    : null;
}
