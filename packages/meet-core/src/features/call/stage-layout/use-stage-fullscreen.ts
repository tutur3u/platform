'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * True browser fullscreen for the stage, on top of the layout's maximize.
 * Entering fullscreen maximizes the chosen pane; leaving it, by the toggle or
 * the browser's own Esc, puts the maximize state back as it was. The people's
 * tiles stay inside the fullscreen element, so their media never remounts.
 */
export function useStageFullscreen({
  root,
  maximizedId,
  maximize,
}: {
  root: { current: HTMLElement | null };
  maximizedId: string | null;
  maximize: (paneId: string | null) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  // What `maximizedId` was before fullscreen took over; `undefined` while not in fullscreen.
  const before = useRef<string | null | undefined>(undefined);
  const maximizeRef = useRef(maximize);
  maximizeRef.current = maximize;
  const supported =
    typeof document !== 'undefined' && document.fullscreenEnabled === true;

  useEffect(() => {
    const onChange = () => {
      const active =
        !!root.current && document.fullscreenElement === root.current;
      setFullscreen(active);
      if (!active && before.current !== undefined) {
        maximizeRef.current(before.current);
        before.current = undefined;
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [root]);

  const toggle = useCallback(
    (paneId: string) => {
      const element = root.current;
      if (!element) return;
      if (document.fullscreenElement === element) {
        void document.exitFullscreen().catch(() => undefined);
        return;
      }
      before.current = maximizedId;
      maximizeRef.current(paneId);
      void Promise.resolve(element.requestFullscreen?.()).catch(() => {
        // Refused (a permissions policy, or a browser without it): keep the
        // in-call maximize and forget the restore.
        before.current = undefined;
      });
    },
    [root, maximizedId]
  );

  return { fullscreen, supported, toggle };
}
