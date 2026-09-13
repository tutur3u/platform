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
  onCollapse,
  scrollContainerRef,
}: {
  enabled: boolean;
  protectedContent: boolean;
  onCollapse?: () => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}) {
  const [compact, setCompact] = useState(false);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearTimer = useCallback(() => clearTimeout(timer.current), []);
  const collapse = useCallback(() => {
    onCollapse?.();
    setCompact(true);
  }, [onCollapse]);
  const schedule = useCallback(() => {
    clearTimer();
    if (!enabled || protectedContent || focused.current) return;
    timer.current = setTimeout(collapse, COMPOSER_IDLE_MS);
  }, [clearTimer, collapse, enabled, protectedContent]);
  const expand = useCallback(() => {
    setCompact(false);
    schedule();
  }, [schedule]);

  useEffect(() => {
    if (!enabled) setCompact(false);
    schedule();
    return clearTimer;
  }, [clearTimer, enabled, schedule]);

  useEffect(() => {
    const node = scrollContainerRef?.current;
    if (!enabled || !node) return;
    let previous = node.scrollTop;
    const onScroll = () => {
      const delta = node.scrollTop - previous;
      previous = node.scrollTop;
      if (delta > 4 && !protectedContent && !focused.current) {
        clearTimer();
        collapse();
      }
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [clearTimer, collapse, enabled, protectedContent, scrollContainerRef]);

  return {
    compact: enabled && !protectedContent && compact,
    expand,
    onActivity: schedule,
    onFocus: (keepExpanded = true) => {
      focused.current = keepExpanded;
      schedule();
      setCompact(false);
    },
    onBlur: () => {
      focused.current = false;
      schedule();
    },
  };
}
