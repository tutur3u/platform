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
  type StoredStage,
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

type Change = (layout: StageLayout, maxPanes: number) => StageLayout;

export type StageLayoutController = ReturnType<typeof useStageLayout>;

/**
 * The stage's open activities for one person in one room. The layout is read
 * from local storage once and written back as it changes, so it survives
 * reconnects and reloads.
 *
 * The desktop arrangement is the source of truth. A narrower screen shows it
 * fitted to its pane limit until the person arranges panes there, which keeps
 * a separate arrangement for that screen size; layout edits made on a narrow
 * screen never rewrite the desktop split. Opening and closing an activity
 * applies to every arrangement so they all hold the same activities. What is
 * shown is limited to activities that are available now, without rewriting
 * what is saved, so regaining access brings panes back.
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
  const [stored, setStored] = useState<StoredStage>(() =>
    typeof window === 'undefined'
      ? { layout: EMPTY_LAYOUT, views: {}, strip: 'auto' }
      : readStoredStage(key)
  );
  const measured = useViewportTier();
  const tier = forcedTier ?? measured;
  const maxPanes = MAX_PANES[tier];
  const limits = useRef({ tier, isAvailable });
  limits.current = { tier, isAvailable };

  /** One arrangement as a screen of `at` tier shows it. */
  const present = useCallback(
    (layout: StageLayout, at: ViewportTier) =>
      fitLayout(
        pruneLayout(layout, (id) => limits.current.isAvailable(id)),
        MAX_PANES[at]
      ),
    []
  );
  const saved = (from: StoredStage, at: ViewportTier) =>
    at === 'desktop' ? from.layout : (from.views[at] ?? from.layout);
  const shown = useMemo(
    () => present(saved(stored, tier), tier),
    // Availability is read through `limits`; it is listed so the view follows it.
    [present, stored, tier, isAvailable]
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

  /**
   * Applies an edit to what is on screen and keeps the result for this screen
   * size. A `shared` edit changes which activities are open, so it also
   * applies to every other arrangement.
   */
  const edit = useCallback(
    (change: Change, shared = false) => {
      dirty.current = true;
      setStored((current) => {
        const at = limits.current.tier;
        const apply = (layout: StageLayout, to: ViewportTier) =>
          change(present(layout, to), MAX_PANES[to]);
        const next: StoredStage = { ...current, views: { ...current.views } };
        if (at === 'desktop') next.layout = apply(current.layout, at);
        else next.views[at] = apply(saved(current, at), at);
        if (shared) {
          if (at !== 'desktop') next.layout = apply(current.layout, 'desktop');
          for (const other of ['tablet', 'phone'] as const) {
            const view = current.views[other];
            if (other !== at && view) next.views[other] = apply(view, other);
          }
        }
        return next;
      });
    },
    [present]
  );

  const open = useCallback(
    (id: string, options?: Pick<OpenOptions, 'placement'>) =>
      edit(
        (layout, max) =>
          openActivity(layout, id, { maxPanes: max, ...options }),
        true
      ),
    [edit]
  );
  const close = useCallback(
    (id: string) => edit((layout) => closeActivity(layout, id), true),
    [edit]
  );
  const toggle = useCallback(
    (id: string) =>
      edit(
        (layout, max) =>
          isActivityOpen(layout, id)
            ? closeActivity(layout, id)
            : openActivity(layout, id, { maxPanes: max }),
        true
      ),
    [edit]
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
