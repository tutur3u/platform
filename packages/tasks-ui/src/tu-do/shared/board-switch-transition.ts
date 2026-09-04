'use client';

type BoardSwitchTransition = {
  boardId: string | null;
  sequence: number;
};

const listeners = new Set<() => void>();
const serverSnapshot: BoardSwitchTransition = {
  boardId: null,
  sequence: 0,
};

let transitionSnapshot = serverSnapshot;

export function announceTaskBoardSwitch(boardId: string) {
  transitionSnapshot = {
    boardId,
    sequence: transitionSnapshot.sequence + 1,
  };
  for (const listener of listeners) listener();
}

export function getTaskBoardSwitchTransition() {
  return transitionSnapshot;
}

export function getServerTaskBoardSwitchTransition() {
  return serverSnapshot;
}

export function subscribeToTaskBoardSwitchTransition(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
