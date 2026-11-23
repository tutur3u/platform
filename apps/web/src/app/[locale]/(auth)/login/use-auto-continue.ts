'use client';

import { useEffect, useRef, useState } from 'react';

/** Long enough to read the interstitial and press Cancel, short enough to feel instant. */
export const AUTO_CONTINUE_DELAY_MS = 1200;

/**
 * Continues a focused sign-in on its own after a short, cancellable pause.
 * It fires at most once per mount: a cancel, or a failed continue that
 * returns the card to its idle state, never schedules another attempt.
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
  const firedRef = useRef(false);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;
  const counting = eligible && !cancelled && !firedRef.current;

  useEffect(() => {
    if (!counting) return;
    const timer = globalThis.setTimeout(() => {
      firedRef.current = true;
      onContinueRef.current();
    }, delayMs);
    return () => globalThis.clearTimeout(timer);
  }, [counting, delayMs]);

  return { cancel: () => setCancelled(true), counting };
}
