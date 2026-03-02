'use client';

import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { SCROLL_END_DELAY_MS } from './mira-chat-constants';

interface UseMiraBottomBarVisibilityParams {
  hasMessages: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  viewOnly: boolean;
}

export function useMiraBottomBarVisibility({
  hasMessages,
  scrollContainerRef,
  viewOnly,
}: UseMiraBottomBarVisibilityParams) {
  const [bottomBarVisible, setBottomBarVisible] = useState(true);
  const firstMessageSeenRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasMessages) return;
    const element = scrollContainerRef.current;
    if (!element) return;

    const onScroll = () => {
      const isNearBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight < 50;

      if (viewOnly) {
        setBottomBarVisible(isNearBottom);
        return;
      }

      if (isNearBottom) {
        setBottomBarVisible(true);
        if (scrollEndTimerRef.current) {
          clearTimeout(scrollEndTimerRef.current);
          scrollEndTimerRef.current = null;
        }
        return;
      }

      setBottomBarVisible(false);
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = setTimeout(() => {
        scrollEndTimerRef.current = null;
        setBottomBarVisible(true);
      }, SCROLL_END_DELAY_MS);
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      element.removeEventListener('scroll', onScroll);
      if (scrollEndTimerRef.current) {
        clearTimeout(scrollEndTimerRef.current);
        scrollEndTimerRef.current = null;
      }
    };
  }, [hasMessages, scrollContainerRef, viewOnly]);

  useEffect(() => {
    if (!hasMessages) {
      firstMessageSeenRef.current = false;
      setBottomBarVisible(true);
      return;
    }

    if (firstMessageSeenRef.current) return;

    firstMessageSeenRef.current = true;
    setBottomBarVisible(true);
  }, [hasMessages]);

  return {
    bottomBarVisible,
    setBottomBarVisible,
  };
}
