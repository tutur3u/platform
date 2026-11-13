'use client';

import { useState } from 'react';

export function useWorkspacePickerPreferences(actorId?: string) {
  const [state, setState] = useState<{
    actorId?: string;
    pinned: string[];
    recent: string[];
  }>({ actorId, pinned: [], recent: [] });
  if (state.actorId !== actorId) {
    setState({ actorId, pinned: [], recent: [] });
  }
  const active = state.actorId === actorId;
  const pinned = active && actorId ? state.pinned : [];
  const recent = active && actorId ? state.recent : [];
  return {
    pinned,
    recent,
    record(id: string) {
      if (!actorId) return;
      setState((current) =>
        current.actorId !== actorId
          ? current
          : {
              ...current,
              recent: [
                id,
                ...current.recent.filter((value) => value !== id),
              ].slice(0, 5),
            }
      );
    },
    togglePin(id: string) {
      if (!actorId) return;
      setState((current) =>
        current.actorId !== actorId
          ? current
          : {
              ...current,
              pinned: current.pinned.includes(id)
                ? current.pinned.filter((value) => value !== id)
                : [...current.pinned, id],
            }
      );
    },
  };
}
