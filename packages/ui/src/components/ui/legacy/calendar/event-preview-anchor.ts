'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Clicks older than this are not treated as the gesture that opened the preview. */
const OPENING_CLICK_WINDOW_MS = 750;
/** Narrow screens anchor below the top strip of the event so the preview stays on screen. */
const NARROW_VIEWPORT_PX = 640;
const NARROW_ANCHOR_HEIGHT_PX = 32;

export type EventPreviewAnchor = {
  element: HTMLElement;
  side: 'right' | 'bottom';
  virtualRef: { current: { getBoundingClientRect: () => DOMRect } };
};

function eventCardSelector(eventId: string) {
  return `[data-calendar-event-id=${JSON.stringify(eventId)}]`;
}

function visibleRect(element: HTMLElement, narrow: boolean): DOMRect | null {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  const visibleHeight = Math.max(bottom - top, 0);
  const height = narrow
    ? Math.min(visibleHeight, NARROW_ANCHOR_HEIGHT_PX)
    : visibleHeight;
  const box = {
    x: rect.left,
    y: top,
    left: rect.left,
    top,
    right: rect.right,
    bottom: top + height,
    width: rect.width,
    height,
  };
  return { ...box, toJSON: () => box };
}

function createAnchor(
  eventId: string,
  initial: HTMLElement
): EventPreviewAnchor | null {
  const narrow = window.innerWidth < NARROW_VIEWPORT_PX;
  let element = initial;
  const initialRect = visibleRect(element, narrow);
  if (!initialRect) return null;
  let lastRect: DOMRect = initialRect;

  return {
    element,
    side: narrow ? 'bottom' : 'right',
    virtualRef: {
      current: {
        getBoundingClientRect: () => {
          if (!element.isConnected) {
            const replacement = document.querySelector<HTMLElement>(
              eventCardSelector(eventId)
            );
            if (replacement) element = replacement;
          }
          lastRect = visibleRect(element, narrow) ?? lastRect;
          return lastRect;
        },
      },
    },
  };
}

/**
 * Resolves the on-screen element of the event that opened the preview.
 *
 * The element that received the opening click (mouse, touch or keyboard
 * activation) wins, so a multi-day event anchors to the segment the user chose.
 * Events opened without a click fall back to their rendered event card. The
 * anchor is null when nothing is on screen; the preview then uses a fixed
 * corner. `resolved` stays false until the anchor for `eventId` is measured, so
 * the preview never paints at the corner and then jumps.
 */
export function useEventPreviewAnchor(eventId: string | undefined): {
  anchor: EventPreviewAnchor | null;
  resolved: boolean;
} {
  const lastClick = useRef<{ element: HTMLElement; at: number } | null>(null);
  const [state, setState] = useState<{
    eventId: string;
    anchor: EventPreviewAnchor | null;
  } | null>(null);

  useEffect(() => {
    const recordClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest<HTMLElement>(
        'button, [role="button"], [tabindex]'
      );
      lastClick.current = element ? { element, at: performance.now() } : null;
    };
    document.addEventListener('click', recordClick, true);
    return () => document.removeEventListener('click', recordClick, true);
  }, []);

  useLayoutEffect(() => {
    if (!eventId) {
      setState(null);
      return;
    }
    const click = lastClick.current;
    const clicked =
      click &&
      click.element.isConnected &&
      performance.now() - click.at < OPENING_CLICK_WINDOW_MS
        ? click.element
        : null;
    const element =
      clicked ??
      document.querySelector<HTMLElement>(eventCardSelector(eventId));
    setState({
      eventId,
      anchor: element ? createAnchor(eventId, element) : null,
    });
  }, [eventId]);

  const resolved = !!eventId && state?.eventId === eventId;
  return { anchor: resolved ? (state?.anchor ?? null) : null, resolved };
}
