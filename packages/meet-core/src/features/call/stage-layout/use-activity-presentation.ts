'use client';

import { useEffect, useState } from 'react';
import type { ActivityNavigation } from './use-stage-navigation';

const SHARE_END_DELAY_MS = 1500;

type NavigationNotice = Exclude<ActivityNavigation, { kind: 'invited-summon' }>;

type Presentation = {
  seen: ReadonlySet<string>;
  minimized: 'manual' | 'share' | false;
  notice: NavigationNotice | null;
};

/** A local presentation choice. The open panes and shared layout stay intact. */
export function useActivityPresentation(
  hasPanes: boolean,
  sharers: readonly string[]
) {
  const [state, setState] = useState<Presentation>({
    seen: new Set(),
    minimized: false,
    notice: null,
  });
  const sharing = sharers.length > 0;
  const hadSharers = state.seen.size > 0;
  useEffect(() => {
    if (sharing || !hadSharers) return;
    const timer = setTimeout(() => {
      setState((current) => ({
        ...current,
        seen: new Set(),
        minimized: current.minimized === 'share' ? false : current.minimized,
      }));
    }, SHARE_END_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sharing, hadSharers]);

  const started = sharers.some((id) => !state.seen.has(id));
  let { minimized } = state;
  if (!hasPanes) minimized = false;
  else if (started && !minimized) minimized = 'share';
  if (started || minimized !== state.minimized) {
    setState({
      seen: started ? new Set([...state.seen, ...sharers]) : state.seen,
      minimized,
      notice: minimized !== state.minimized ? null : state.notice,
    });
  }

  return {
    minimized: !!minimized,
    autoMinimized: minimized === 'share',
    notice: state.notice,
    minimize: () =>
      setState((current) => ({
        ...current,
        minimized: 'manual',
        notice: null,
      })),
    restore: () =>
      setState((current) => ({ ...current, minimized: false, notice: null })),
    navigate: (navigation: ActivityNavigation) =>
      setState((current) => {
        if (navigation.kind === 'forced-summon')
          return { ...current, minimized: false, notice: navigation };
        if (current.minimized === 'share')
          return { ...current, minimized: false, notice: null };
        if (current.minimized === 'manual' && navigation.kind === 'follow')
          return { ...current, notice: navigation };
        return current;
      }),
  };
}

export type ActivityPresentation = ReturnType<typeof useActivityPresentation>;
