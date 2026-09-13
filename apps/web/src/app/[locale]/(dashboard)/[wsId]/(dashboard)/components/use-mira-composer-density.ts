'use client';

import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export const COMPOSER_IDLE_MS = 6000;

export function useMiraComposerDensity({
  enabled,
  protectedContent,
  scrollContainerRef,
}: {
  enabled: boolean;
  protectedContent: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}) {
  const [compact, setCompact] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearTimer = useCallback(() => clearTimeout(timer.current), []);
  const schedule = useCallback(() => {
    clearTimer();
    if (!enabled || protectedContent || focused.current) return;
    timer.current = setTimeout(() => setCompact(true), COMPOSER_IDLE_MS);
  }, [clearTimer, enabled, protectedContent]);
  const expand = useCallback(() => {
    setShowControls(true);
    setCompact(false);
    schedule();
  }, [schedule]);

  useEffect(() => {
    schedule();
    return clearTimer;
  }, [clearTimer, schedule]);

  useEffect(() => {
    const node = scrollContainerRef?.current;
    if (!enabled || !node) return;
    let previous = node.scrollTop;
    const onScroll = () => {
      const delta = node.scrollTop - previous;
      previous = node.scrollTop;
      if (delta > 4 && !protectedContent && !focused.current) {
        clearTimer();
        setCompact(true);
      }
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [clearTimer, enabled, protectedContent, scrollContainerRef]);

  return {
    compact: enabled && !protectedContent && compact,
    expand,
    showControls,
    onActivity: schedule,
    onFocus: () => {
      setShowControls(true);
      focused.current = true;
      clearTimer();
      setCompact(false);
    },
    onBlur: () => {
      focused.current = false;
      schedule();
    },
  };
}
