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
  EMPTY_LAYOUT,
  fitLayout,
  focusedActivity,
  findPane,
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
  restoreHidden,
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

/** Focuses `activityId` and brings its tab forward, keeping the layout's shape. */
function revealIn(
  layout: StageLayout,
  activityId: string,
  isAvailable: (activityId: string) => boolean
) {
  const pruned = pruneLayout(layout, isAvailable);
  if (!isActivityOpen(pruned, activityId)) return layout;
  const hidden = openActivities(layout).filter(
    (id) => !isActivityOpen(pruned, id)
  );
  const revealed = openActivity(pruned, activityId, {
    maxPanes: MAX_PANES.desktop,
  });
  return revealed === pruned ? layout : restoreHidden(revealed, layout, hidden);
}

type Change = (layout: StageLayout, maxPanes: number) => StageLayout;

export type StageLayoutController = ReturnType<typeof useStageLayout>;

interface Loaded extends StoredStage {
  key: string;
}

const load = (key: string): Loaded =>
  typeof window === 'undefined'
    ? { key, layout: EMPTY_LAYOUT, views: {}, strip: 'auto' }
    : { key, ...readStoredStage(key) };

/**
 * The stage's open activities for one person in one room. The layout is read
 * from local storage for the room's key and written back when it changes, so
 * it survives reconnects and reloads.
 *
 * The desktop arrangement is the source of truth. A narrower screen shows it
 * folded to its pane limit until the person arranges panes there, which saves
 * a separate arrangement for that screen size, so editing there never rewrites
 * the desktop split. Opening and closing an activity applies to every
 * arrangement so they all hold the same activities.
 *
 * What is shown leaves out activities that are unavailable right now. An edit
 * keeps them: they return to their pane, or join the focused pane, so regaining
 * access brings them back.
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
  const [stored, setStored] = useState(() => load(key));
  // A different room (or person) has its own layout.
  if (stored.key !== key) setStored(load(key));
  const measured = useViewportTier();
  const tier = forcedTier ?? measured;
  const limits = useRef({ tier, isAvailable });
  limits.current = { tier, isAvailable };

  const arrangement = (from: StoredStage, at: ViewportTier) =>
    at === 'desktop' ? from.layout : (from.views[at] ?? from.layout);
  const shown = useMemo(
    () =>
      fitLayout(
        pruneLayout(arrangement(stored, tier), isAvailable),
        MAX_PANES[tier]
      ),
    [stored, tier, isAvailable]
  );

  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) return;
    dirty.current = false;
    writeStoredStage(stored.key, stored);
  }, [stored]);

  /**
   * Applies an edit to what is on screen and keeps the result for this screen
   * size. A `shared` edit changes which activities are open, so it also
   * applies to every other arrangement. A `reveal` edit only moves focus or
   * switches a tab to that activity: on a narrow screen with no arrangement of
   * its own it follows the desktop arrangement instead of forking one. An edit
   * that changes nothing keeps the stored object as it is.
   */
  const edit = useCallback(
    (change: Change, shared = false, reveal?: string) => {
      setStored((current) => {
        const { tier: at, isAvailable: available } = limits.current;
        if (reveal && at !== 'desktop' && !current.views[at]) {
          const layout = revealIn(current.layout, reveal, available);
          if (layout === current.layout) return current;
          dirty.current = true;
          return { ...current, layout };
        }
        const apply = (layout: StageLayout, to: ViewportTier) => {
          const pruned = pruneLayout(layout, available);
          const fitted = fitLayout(pruned, MAX_PANES[to]);
          const edited = change(fitted, MAX_PANES[to]);
          if (edited === fitted) return layout;
          const hidden = openActivities(layout).filter(
            (id) => !isActivityOpen(pruned, id)
          );
          return restoreHidden(edited, layout, hidden);
        };
        const next: Loaded = { ...current, views: { ...current.views } };
        const own = arrangement(current, at);
        const edited = apply(own, at);
        if (at === 'desktop') next.layout = edited;
        else if (edited !== own) next.views[at] = edited;
        if (shared) {
          if (at !== 'desktop') next.layout = apply(current.layout, 'desktop');
          for (const other of ['tablet', 'phone'] as const) {
            const view = current.views[other];
            if (other !== at && view) next.views[other] = apply(view, other);
          }
        }
        const same =
          next.layout === current.layout &&
          next.views.tablet === current.views.tablet &&
          next.views.phone === current.views.phone;
        if (same) return current;
        dirty.current = true;
        return next;
      });
    },
    []
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
    setStored((current) => {
      if (current.strip === strip) return current;
      dirty.current = true;
      return { ...current, strip };
    });
  }, []);

  return {
    layout: shown,
    tier,
    maxPanes: MAX_PANES[tier],
    strip: stored.strip,
    openIds: useMemo(() => openActivities(shown), [shown]),
    focused: focusedActivity(shown),
    isOpen: (id: string) => isActivityOpen(shown, id),
    open,
    close,
    toggle,
    setStrip,
    activate: (paneId: string, id: string) =>
      edit((layout) => activateTab(layout, paneId, id), false, id),
    focusPane: (paneId: string) =>
      edit(
        (layout) => focusPane(layout, paneId),
        false,
        findPane(shown, paneId)?.active
      ),
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
