'use client';

import { useEffect, useRef, useState } from 'react';

/** Long enough to read the interstitial and press Cancel, short enough to feel instant. */
export const AUTO_CONTINUE_DELAY_MS = 1200;

/**
 * Continues a focused sign-in on its own after a short, cancellable pause.
 * It fires at most once per mount: a cancel, or a failed continue that
 * returns the card to its idle state, never schedules another attempt.
 * While Cancel has focus or a pointer over it the countdown holds, and it
 * restarts in full once both are released, so keyboard and screen-reader
 * users can reach Cancel in time. The holds clear whenever the countdown
 * stops, so a Cancel that unmounts under the pointer never leaves a later
 * countdown stuck.
 *
 * `eligible` must already encode the security gate (a strict PKCE
 * registration with a valid challenge, and the session the card names).
 */
export function useAutoContinue({
  delayMs = AUTO_CONTINUE_DELAY_MS,
  eligible,
  onContinue,
}: {
  delayMs?: number;
  eligible: boolean;
  onContinue: () => void;
}) {
  const [cancelled, setCancelled] = useState(false);
  const [focusHeld, setFocusHeld] = useState(false);
  const [pointerHeld, setPointerHeld] = useState(false);
  const firedRef = useRef(false);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;
  const counting = eligible && !cancelled && !firedRef.current;
  if (!counting && (focusHeld || pointerHeld)) {
    setFocusHeld(false);
    setPointerHeld(false);
  }
  const running = counting && !focusHeld && !pointerHeld;

  useEffect(() => {
    if (!running) return;
    const timer = globalThis.setTimeout(() => {
      firedRef.current = true;
      onContinueRef.current();
    }, delayMs);
    return () => globalThis.clearTimeout(timer);
  }, [running, delayMs]);

  return {
    cancel: () => setCancelled(true),
    counting,
    /** Spread onto the Cancel control. */
    holdHandlers: {
      onBlur: () => setFocusHeld(false),
      onFocus: () => setFocusHeld(true),
      onPointerEnter: () => setPointerHeld(true),
      onPointerLeave: () => setPointerHeld(false),
    },
  };
}
