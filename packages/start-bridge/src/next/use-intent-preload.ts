'use client';

import { type AnyRouter, useRouter } from '@tanstack/react-router';
import {
  type FocusEvent,
  type MouseEvent,
  type SyntheticEvent,
  type TouchEvent,
  useEffect,
  useRef,
} from 'react';

/** Matches TanStack Router's default `preloadDelay` for intent preloading. */
const INTENT_PRELOAD_DELAY_MS = 50;

/**
 * Preloads an app-base `href`. The router strips the base through its
 * rewrite exactly as `navigate({ href })` does; the preload types only name
 * `to`, so the cast lives here. A failed or redirecting preload leaves the
 * click to navigate normally.
 */
function preloadHref(router: AnyRouter, href: string) {
  void router
    .preloadRoute({ href } as unknown as Parameters<
      AnyRouter['preloadRoute']
    >[0])
    .catch(() => {});
}

type Handler<E extends SyntheticEvent> = ((event: E) => void) | undefined;

/** Runs the caller's handler, then ours. */
function chain<E extends SyntheticEvent>(caller: Handler<E>, own: () => void) {
  return (event: E) => {
    caller?.(event);
    own();
  };
}

/**
 * Hover/focus (after a short delay) and touch handlers that preload `href`'s
 * loader when `enabled`, matching TanStack `<Link preload="intent">`.
 */
export function useIntentPreload(
  href: string,
  enabled: boolean,
  handlers: {
    onBlur?: Handler<FocusEvent<HTMLAnchorElement>>;
    onFocus?: Handler<FocusEvent<HTMLAnchorElement>>;
    onMouseEnter?: Handler<MouseEvent<HTMLAnchorElement>>;
    onMouseLeave?: Handler<MouseEvent<HTMLAnchorElement>>;
    onTouchStart?: Handler<TouchEvent<HTMLAnchorElement>>;
  }
) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const preload = () => {
    cancel();
    if (enabled) preloadHref(router, href);
  };
  const schedule = () => {
    cancel();
    if (enabled) timer.current = setTimeout(preload, INTENT_PRELOAD_DELAY_MS);
  };
  // A timer scheduled for an older href or while preloading was allowed must
  // not fire after either changes, nor after unmount.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    },
    [enabled, href]
  );
  return {
    onMouseEnter: chain(handlers.onMouseEnter, schedule),
    onMouseLeave: chain(handlers.onMouseLeave, cancel),
    onFocus: chain(handlers.onFocus, schedule),
    onBlur: chain(handlers.onBlur, cancel),
    onTouchStart: chain(handlers.onTouchStart, preload),
  };
}
