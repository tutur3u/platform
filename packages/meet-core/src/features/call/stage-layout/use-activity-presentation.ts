'use client';

import { useState } from 'react';

type Presentation = {
  seen: ReadonlySet<string>;
  minimized: 'manual' | 'share' | false;
};

/** A local presentation choice. The open panes and shared layout stay intact. */
export function useActivityPresentation(
  hasPanes: boolean,
  sharers: readonly string[]
) {
  const [state, setState] = useState<Presentation>({
    seen: new Set(),
    minimized: false,
  });
  const started = sharers.some((id) => !state.seen.has(id));
  const ended = sharers.length === 0 && state.seen.size > 0;
  let minimized = state.minimized;
  if (!hasPanes) minimized = false;
  else if (started && !minimized) minimized = 'share';
  else if (!sharers.length && minimized === 'share') minimized = false;
  if (started || ended || minimized !== state.minimized) {
    // Individual media updates can flicker while the session stays active.
    const seen = ended
      ? new Set<string>()
      : started
        ? new Set([...state.seen, ...sharers])
        : state.seen;
    setState({ seen, minimized });
  }

  return {
    minimized: !!minimized,
    autoMinimized: minimized === 'share',
    minimize: () => setState((current) => ({ ...current, minimized: 'manual' })),
    restore: () => setState((current) => ({ ...current, minimized: false })),
    restoreAutoMinimized: () =>
      setState((current) =>
        current.minimized === 'share'
          ? { ...current, minimized: false }
          : current
      ),
  };
}

export type ActivityPresentation = ReturnType<typeof useActivityPresentation>;
