'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Board pages ask for task edits in a right side panel instead of a centered
 * dialog. The task dialog is mounted once per workspace layout, so the board
 * registers itself here and the dialog reports back while the panel is open,
 * letting the board leave room for it.
 */
let panelSurfaces = 0;
let panelOpen = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Registers the calling view as a panel surface while it is mounted. */
export function useTaskPanelSurface(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    panelSurfaces += 1;
    emit();
    return () => {
      panelSurfaces -= 1;
      emit();
    };
  }, [enabled]);
}

export function useIsTaskPanelSurfaceActive() {
  return useSyncExternalStore(
    subscribe,
    () => panelSurfaces > 0,
    () => false
  );
}

export function setTaskPanelOpen(open: boolean) {
  if (panelOpen === open) return;
  panelOpen = open;
  emit();
}

export function useIsTaskPanelOpen() {
  return useSyncExternalStore(
    subscribe,
    () => panelOpen,
    () => false
  );
}
