'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Set on `<html>` while the stage is in fullscreen. Call chrome that should
 * give way (the header and the side panel) hides itself with
 * {@link HIDE_IN_STAGE_FULLSCREEN}; the dock and everything portaled to the
 * body stay.
 */
export const STAGE_FULLSCREEN_ATTRIBUTE = 'data-stage-fullscreen';
export const HIDE_IN_STAGE_FULLSCREEN =
  '[html[data-stage-fullscreen]_&]:hidden';

/** More than this many nested fullscreen elements is not a real page. */
const MAX_NESTED_FULLSCREEN = 8;

/**
 * Leaves fullscreen all the way. A tile can be fullscreen inside the document,
 * and one exit only pops that tile, so it repeats until nothing is fullscreen.
 */
async function leaveFullscreen() {
  for (
    let i = 0;
    i < MAX_NESTED_FULLSCREEN && document.fullscreenElement;
    i++
  ) {
    try {
      await document.exitFullscreen();
    } catch {
      return;
    }
  }
}

/**
 * True browser fullscreen for the stage, on top of the layout's maximize. The
 * whole document goes fullscreen, not the stage element: menus, tooltips,
 * dialogs and toasts are portaled to the body and would vanish if only a
 * subtree were fullscreen, and so would the call dock. Entering maximizes the
 * chosen pane and hides the header and side panel by CSS, which keeps every
 * component mounted, so the people's media never restarts. Leaving, by the
 * toggle or the browser's Esc, puts the maximize state back as it was.
 *
 * A participant tile can take fullscreen for itself while the stage is in it;
 * that is not the end of the stage's fullscreen, so the saved maximize state is
 * kept until the document itself leaves fullscreen.
 */
export function useStageFullscreen({
  maximizedId,
  maximize,
}: {
  maximizedId: string | null;
  maximize: (paneId: string | null) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  // What `maximizedId` was before fullscreen took over; `undefined` while not in it.
  const before = useRef<string | null | undefined>(undefined);
  const maximizeRef = useRef(maximize);
  maximizeRef.current = maximize;
  const supported =
    typeof document !== 'undefined' && document.fullscreenEnabled === true;

  useEffect(() => {
    const root = document.documentElement;
    const onChange = () => {
      const element = document.fullscreenElement;
      // Ours while the document is fullscreen, or while something inside it
      // (a tile) is, after we asked for it.
      const ours =
        element === root ||
        (!!element && before.current !== undefined && root.contains(element));
      setFullscreen(ours);
      if (ours) root.setAttribute(STAGE_FULLSCREEN_ATTRIBUTE, '');
      else {
        root.removeAttribute(STAGE_FULLSCREEN_ATTRIBUTE);
        if (before.current !== undefined) {
          maximizeRef.current(before.current);
          before.current = undefined;
        }
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      root.removeAttribute(STAGE_FULLSCREEN_ATTRIBUTE);
      // The stage is going away (leaving the call, an ended or error screen, a
      // route change) while the page is fullscreen: do not leave the browser
      // fullscreen with no call UI in it.
      if (before.current !== undefined && document.fullscreenElement)
        void leaveFullscreen();
    };
  }, []);

  const exit = useCallback(() => {
    void leaveFullscreen();
  }, []);

  const toggle = useCallback(
    (paneId: string) => {
      const root = document.documentElement;
      if (before.current !== undefined) return exit();
      before.current = maximizedId;
      maximizeRef.current(paneId);
      void Promise.resolve(root.requestFullscreen?.()).catch(() => {
        // Refused (a permissions policy, or a browser without it): keep the
        // in-call maximize and forget the restore.
        before.current = undefined;
      });
    },
    [maximizedId, exit]
  );

  return { fullscreen, supported, toggle, exit };
}
