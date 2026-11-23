import { type RefObject, useEffect, useState } from 'react';

export const IDLE_CONTROLS_MS = 2500;

/**
 * Reports whether overlay controls should be visible while `active`: shown on
 * pointer movement, touch, key press or focus inside `target`, hidden after
 * `delay` ms without any. Always visible while inactive.
 */
export function useIdleControls(
  target: RefObject<HTMLElement | null>,
  active: boolean,
  delay = IDLE_CONTROLS_MS
) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const element = target.current;
    setVisible(true);
    if (!active || !element) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), delay);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'focusin'];
    for (const name of events) element.addEventListener(name, wake);
    wake();
    return () => {
      if (timer) clearTimeout(timer);
      for (const name of events) element.removeEventListener(name, wake);
    };
  }, [target, active, delay]);
  return visible;
}
