'use client';

import { useState } from 'react';

type Presentation = {
  sharers: readonly string[];
  minimized: 'manual' | 'share' | false;
};

/** A local presentation choice. The open panes and shared layout stay intact. */
export function useActivityPresentation(
  hasPanes: boolean,
  sharers: readonly string[]
) {
  const [state, setState] = useState<Presentation>({
    sharers: [],
    minimized: false,
  });
  const started = sharers.some((id) => !state.sharers.includes(id));
  let minimized = state.minimized;
  if (!hasPanes) minimized = false;
  else if (started && !minimized) minimized = 'share';
  else if (!sharers.length && minimized === 'share') minimized = false;
  if (
    started ||
    sharers.length !== state.sharers.length ||
    minimized !== state.minimized
  )
    setState({ sharers, minimized });

  return {
    minimized: !!minimized,
    minimize: () => setState((current) => ({ ...current, minimized: 'manual' })),
    restore: () => setState((current) => ({ ...current, minimized: false })),
  };
}

export type ActivityPresentation = ReturnType<typeof useActivityPresentation>;
