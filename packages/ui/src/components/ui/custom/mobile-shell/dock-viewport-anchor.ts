/**
 * Keeps the floating mobile dock on the visible bottom edge.
 *
 * CSS pins the dock (`position: fixed` against the safe area). WebKit, in
 * Safari and in in-app browsers such as Instagram's, can resume a page with
 * fixed content laid out against a viewport shorter than the visible one
 * after an app switch or a toolbar change, which leaves the dock floating
 * above the edge until the next layout. A hidden `position: fixed; bottom: 0`
 * probe shows where fixed content really ends; when that is above the visible
 * bottom (`visualViewport`), the gap is published as
 * `--mobile-dock-viewport-drop` on the root element and the dock, its fade
 * and bottom toasts move down by it. Browsers that already keep fixed content
 * on the visible edge (a collapsing toolbar, Android Chrome) measure no gap.
 * Nothing is published while the page is pinch-zoomed or for implausible
 * gaps, so CSS stays the source of truth everywhere else.
 */

export const DOCK_VIEWPORT_DROP_PROPERTY = '--mobile-dock-viewport-drop';

/** Gaps up to this are sub-pixel rounding, not drift. */
export const DOCK_VIEWPORT_DROP_MIN = 2;

/** Gaps beyond this are not toolbar drift (for example a split view). */
export const DOCK_VIEWPORT_DROP_MAX = 160;

/** Toolbars and insets settle after their animation; re-measure once then. */
export const DOCK_VIEWPORT_SETTLE_MS = 400;

type AnchorWindow = Pick<
  Window,
  | 'addEventListener'
  | 'removeEventListener'
  | 'requestAnimationFrame'
  | 'cancelAnimationFrame'
  | 'setTimeout'
  | 'clearTimeout'
  | 'visualViewport'
> & { document: Document };

/**
 * Pixels the visible bottom edge sits below the bottom of fixed content, as
 * shown by `probe` (a `position: fixed; bottom: 0` element of zero height).
 */
export function measureDockViewportDrop(
  win: AnchorWindow,
  probe: Element
): number {
  const viewport = win.visualViewport;
  if (!viewport || Math.abs(viewport.scale - 1) > 0.01) return 0;
  const fixedBottom = probe.getBoundingClientRect().top;
  const drop = Math.round(viewport.offsetTop + viewport.height - fixedBottom);
  return drop > DOCK_VIEWPORT_DROP_MIN && drop <= DOCK_VIEWPORT_DROP_MAX
    ? drop
    : 0;
}

function createProbe(doc: Document) {
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.dataset.slot = 'mobile-dock-viewport-probe';
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none';
  doc.body.appendChild(probe);
  return probe;
}

function track(win: AnchorWindow): () => void {
  const doc = win.document;
  const root = doc.documentElement;
  const probe = createProbe(doc);
  let frame: number | null = null;
  let settle: number | null = null;
  let published = 0;

  const apply = () => {
    frame = null;
    const drop = measureDockViewportDrop(win, probe);
    if (drop === published) return;
    published = drop;
    if (drop) root.style.setProperty(DOCK_VIEWPORT_DROP_PROPERTY, `${drop}px`);
    else root.style.removeProperty(DOCK_VIEWPORT_DROP_PROPERTY);
  };

  const schedule = () => {
    if (frame === null) frame = win.requestAnimationFrame(apply);
    if (settle !== null) win.clearTimeout(settle);
    settle = win.setTimeout(() => {
      settle = null;
      apply();
    }, DOCK_VIEWPORT_SETTLE_MS);
  };

  const onVisibility = () => {
    if (doc.visibilityState === 'visible') schedule();
  };

  const viewport = win.visualViewport;
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  win.addEventListener('resize', schedule);
  win.addEventListener('orientationchange', schedule);
  win.addEventListener('pageshow', schedule);
  win.addEventListener('focus', schedule);
  doc.addEventListener('visibilitychange', onVisibility);
  schedule();

  return () => {
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('orientationchange', schedule);
    win.removeEventListener('pageshow', schedule);
    win.removeEventListener('focus', schedule);
    doc.removeEventListener('visibilitychange', onVisibility);
    if (frame !== null) win.cancelAnimationFrame(frame);
    if (settle !== null) win.clearTimeout(settle);
    probe.remove();
    root.style.removeProperty(DOCK_VIEWPORT_DROP_PROPERTY);
  };
}

const anchors = new WeakMap<
  AnchorWindow,
  { count: number; stop: () => void }
>();

/**
 * Starts tracking for one dock; returns its cleanup. Docks on the same window
 * share one tracker, which stops when the last of them detaches.
 */
export function attachDockViewportAnchor(win: AnchorWindow): () => void {
  const current = anchors.get(win);
  if (current) current.count += 1;
  else anchors.set(win, { count: 1, stop: track(win) });

  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    const entry = anchors.get(win);
    if (!entry || --entry.count > 0) return;
    anchors.delete(win);
    entry.stop();
  };
}
