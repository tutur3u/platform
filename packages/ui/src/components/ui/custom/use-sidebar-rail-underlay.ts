import { useCallback, useLayoutEffect, useRef } from 'react';
import { SIDEBAR_OVERLAY_CLOSE_MS } from './use-sidebar-overlay-close';

/** The fading panel; its own `animationend` ends the reveal. */
const SURFACE_SELECTOR = '[data-sidebar-overlay-surface]';

/** Removes the underlay if the reveal never reports its end (hidden tab). */
const REVEAL_FALLBACK_MS = SIDEBAR_OVERLAY_CLOSE_MS + 80;

interface RailSnapshot {
  node: HTMLElement;
  /** Scroll offsets by element index, so a scrolled rail is shown as it was. */
  scrolls: [index: number, top: number][];
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function snapshotRail(rail: HTMLElement): RailSnapshot {
  const scrolls: RailSnapshot['scrolls'] = [];
  const elements = [rail, ...rail.querySelectorAll<HTMLElement>('*')];
  elements.forEach((element, index) => {
    if (element.scrollTop > 0) scrolls.push([index, element.scrollTop]);
  });
  const node = rail.cloneNode(true) as HTMLElement;
  // The live panel reuses these ids; SVG ids stay so gradients still resolve.
  for (const element of node.querySelectorAll('[id]')) {
    if (!(element instanceof SVGElement)) element.removeAttribute('id');
  }
  node.removeAttribute('id');
  return { node, scrolls };
}

function mountSnapshot(host: HTMLElement, snapshot: RailSnapshot) {
  const copy = snapshot.node.cloneNode(true) as HTMLElement;
  host.replaceChildren(copy);
  if (snapshot.scrolls.length === 0) return;
  const elements = [copy, ...copy.querySelectorAll<HTMLElement>('*')];
  for (const [index, top] of snapshot.scrolls) {
    const element = elements[index];
    if (element) element.scrollTop = top;
  }
}

/**
 * Expand-on-hover swaps the rail for the panel in one commit (a keyed
 * remount, so nothing is repositioned). Without help, the rail's icons would
 * vanish and fade back in with the panel. This keeps an inert, static copy of
 * the last rail under the panel while the panel fades in or out, so icons that
 * sit at the same place in both read as still and only the labels and the
 * panel surface fade.
 *
 * `railRef` goes on the rail body. `hostRef` goes on an empty element that
 * covers the rail area beneath the panel, beside the panel surface
 * (`data-sidebar-overlay-surface`), whose own `animationend` removes the copy.
 */
export function useSidebarRailUnderlay({
  enabled,
  isOpen,
  isClosing,
}: {
  enabled: boolean;
  isOpen: boolean;
  isClosing: boolean;
}) {
  const snapshot = useRef<RailSnapshot | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const enabledRef = useRef(enabled);

  // The cleanup runs while React detaches the rail, before the node leaves
  // the document, so its scroll offsets can still be read. Nothing is copied
  // when the copy could not be shown.
  const railRef = useCallback((rail: HTMLElement | null) => {
    if (!rail) return;
    return () => {
      snapshot.current =
        enabledRef.current && !prefersReducedMotion()
          ? snapshotRail(rail)
          : null;
    };
  }, []);

  useLayoutEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) snapshot.current = null;
  }, [enabled]);

  // Drop the detached copy with the sidebar.
  useLayoutEffect(
    () => () => {
      snapshot.current = null;
    },
    []
  );

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    if (!enabled || !isOpen || !snapshot.current || prefersReducedMotion()) {
      element.replaceChildren();
      return;
    }
    mountSnapshot(element, snapshot.current);
    // Closing keeps the copy until the rail itself mounts again.
    if (isClosing) return;
    const clear = () => element.replaceChildren();
    const container = element.parentElement;
    // Only the surface's own fade ends the reveal, not a nested animation.
    const animationEnd = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.parentElement === container &&
        target.matches(SURFACE_SELECTOR)
      ) {
        clear();
      }
    };
    container?.addEventListener('animationend', animationEnd);
    const timer = setTimeout(clear, REVEAL_FALLBACK_MS);
    return () => {
      clearTimeout(timer);
      container?.removeEventListener('animationend', animationEnd);
    };
  }, [enabled, isClosing, isOpen]);

  return { hostRef: host, railRef };
}
