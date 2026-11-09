'use client';

import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * Drives the AI chat demo as a looping conversation rather than a static
 * transcript: each beat is revealed on its own timer, then the thread resets.
 *
 * Under `prefers-reduced-motion` the whole conversation is shown at once and
 * never loops, so nothing moves and nothing is hidden from the reader.
 */
export function useConversation(beats: readonly number[]) {
  const reduced = useReducedMotion();
  const total = beats.length;
  const [step, setStep] = useState(reduced ? total : 0);

  useEffect(() => {
    if (reduced) {
      setStep(total);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const advance = (next: number) => {
      // One extra beat past the end holds the finished thread on screen
      // before the loop restarts.
      const index = next % (total + 1);
      setStep(index);
      timer = setTimeout(
        () => advance(index + 1),
        index === total ? 3600 : (beats[index] ?? 1000)
      );
    };

    timer = setTimeout(() => advance(1), beats[0] ?? 1000);
    return () => clearTimeout(timer);
  }, [beats, reduced, total]);

  // `useReducedMotion` is `boolean | null` until it has measured; treat the
  // unmeasured state as "motion allowed" so consumers get a plain boolean.
  return { step, reduced: reduced === true };
}

/**
 * Reveals `text` one character at a time once `active` turns true.
 * Returns the full string immediately when motion is reduced.
 */
export function useTypewriter(text: string, active: boolean, reduced: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) {
      setCount(0);
      return;
    }
    if (reduced) {
      setCount(text.length);
      return;
    }

    let raf = 0;
    let start: number | null = null;
    const charsPerSecond = 55;

    const tick = (timestamp: number) => {
      start ??= timestamp;
      const elapsed = (timestamp - start) / 1000;
      const next = Math.min(Math.floor(elapsed * charsPerSecond), text.length);
      setCount(next);
      if (next < text.length) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, active, reduced]);

  return { shown: text.slice(0, count), done: count >= text.length };
}
