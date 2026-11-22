'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  activateTab,
  closeActivity,
  fitLayout,
  focusedActivity,
  EMPTY_LAYOUT,
  focusPane,
  isActivityOpen,
  MAX_PANES,
  maximizePane,
  movePane,
  moveTab,
  openActivities,
  openActivity,
  type OpenOptions,
  pruneLayout,
  resetBoundary,
  resizeBoundary,
  type StageLayout,
  swapPanes,
  type ViewportTier,
} from './layout-model';
import {
  readStoredStage,
  stageLayoutKey,
  type VideoStripPreference,
  writeStoredStage,
} from './layout-storage';

export const TABLET_MIN_WIDTH = 768;
export const DESKTOP_MIN_WIDTH = 1024;

export function tierForWidth(width: number): ViewportTier {
  if (width < TABLET_MIN_WIDTH) return 'phone';
  return width < DESKTOP_MIN_WIDTH ? 'tablet' : 'desktop';
}

function subscribeViewport(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

/** Phone, tablet or desktop by viewport width; the server renders desktop. */
export function useViewportTier(): ViewportTier {
  return useSyncExternalStore(
    subscribeViewport,
    () => tierForWidth(window.innerWidth),
    () => 'desktop'
  );
}

const PERSIST_DELAY_MS = 200;

export type StageLayoutController = ReturnType<typeof useStageLayout>;

/**
 * The stage's open activities for one person in one room. The layout is read
 * from local storage once and written back as it changes, so it survives
 * reconnects and reloads. What it shows is always fitted to the viewport and
 * limited to activities that are available now, without rewriting the saved
 * layout, so widening a window or regaining access brings panes back.
 */
export function useStageLayout({
  accountId,
  meetingId,
  isAvailable,
  tier: forcedTier,
}: {
  accountId: string;
  meetingId: string;
  isAvailable: (activityId: string) => boolean;
  tier?: ViewportTier;
}) {
  const key = stageLayoutKey(accountId, meetingId);
  const [stored, setStored] = useState(() =>
    typeof window === 'undefined'
      ? { layout: EMPTY_LAYOUT, strip: 'auto' as VideoStripPreference }
      : readStoredStage(key)
  );
  const measured = useViewportTier();
  const tier = forcedTier ?? measured;
  const maxPanes = MAX_PANES[tier];
  const limits = useRef({ maxPanes, isAvailable });
  limits.current = { maxPanes, isAvailable };

  /** What the viewport can show now: available activities, fitted to panes. */
  const view = useCallback(
    (layout: StageLayout) =>
      fitLayout(
        pruneLayout(layout, (id) => limits.current.isAvailable(id)),
        limits.current.maxPanes
      ),
    []
  );
  const shown = useMemo(
    () => view(stored.layout),
    // Availability and the pane limit are read through `limits`; they are
    // listed so the view follows them.
    [view, stored.layout, maxPanes, isAvailable]
  );

  const dirty = useRef(false);
  const latest = useRef({ key, stored });
  latest.current = { key, stored };
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => {
      dirty.current = false;
      writeStoredStage(key, stored);
    }, PERSIST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, stored]);
  useEffect(
    () => () => {
      if (dirty.current) {
        dirty.current = false;
        writeStoredStage(latest.current.key, latest.current.stored);
      }
    },
    []
  );

  /** Applies an edit to what is on screen and keeps the result. */
  const edit = useCallback(
    (change: (layout: StageLayout) => StageLayout) => {
      dirty.current = true;
      setStored((current) => ({
        ...current,
        layout: change(view(current.layout)),
      }));
    },
    [view]
  );

  const open = useCallback(
    (id: string, options?: Pick<OpenOptions, 'placement'>) =>
      edit((layout) => openActivity(layout, id, { maxPanes, ...options })),
    [edit, maxPanes]
  );
  const close = useCallback(
    (id: string) => edit((layout) => closeActivity(layout, id)),
    [edit]
  );
  const toggle = useCallback(
    (id: string) =>
      edit((layout) =>
        isActivityOpen(layout, id)
          ? closeActivity(layout, id)
          : openActivity(layout, id, { maxPanes })
      ),
    [edit, maxPanes]
  );
  const setStrip = useCallback((strip: VideoStripPreference) => {
    dirty.current = true;
    setStored((current) => ({ ...current, strip }));
  }, []);

  return {
    layout: shown,
    tier,
    maxPanes,
    strip: stored.strip,
    openIds: useMemo(() => openActivities(shown), [shown]),
    focused: focusedActivity(shown),
    isOpen: (id: string) => isActivityOpen(shown, id),
    open,
    close,
    toggle,
    setStrip,
    activate: (paneId: string, id: string) =>
      edit((layout) => activateTab(layout, paneId, id)),
    focusPane: (paneId: string) => edit((layout) => focusPane(layout, paneId)),
    maximize: (paneId: string | null) =>
      edit((layout) => maximizePane(layout, paneId)),
    movePane: (paneId: string, step: -1 | 1) =>
      edit((layout) => movePane(layout, paneId, step)),
    swapPanes: (first: string, second: string) =>
      edit((layout) => swapPanes(layout, first, second)),
    moveTab: (id: string, step: -1 | 1) =>
      edit((layout) => moveTab(layout, id, step)),
    resize: (splitId: string, index: number, position: number) =>
      edit((layout) => resizeBoundary(layout, splitId, index, position)),
    reset: (splitId: string, index: number) =>
      edit((layout) => resetBoundary(layout, splitId, index)),
  };
}
