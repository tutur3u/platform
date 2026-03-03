'use client';

import type { RefObject } from 'react';
import { useEffect, useState } from 'react';

interface UseMiraBottomBarVisibilityParams {
  auxiliaryToolbarRef: RefObject<HTMLDivElement | null>;
  hasMessages: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  toolbarVisibilityAnchorRef: RefObject<HTMLDivElement | null>;
  viewOnly: boolean;
}

export function useMiraBottomBarVisibility({
  auxiliaryToolbarRef,
  hasMessages,
  scrollContainerRef,
  toolbarVisibilityAnchorRef,
  viewOnly,
}: UseMiraBottomBarVisibilityParams) {
  const [bottomBarVisible, setBottomBarVisible] = useState(true);
  const [auxiliaryToolbarHeight, setAuxiliaryToolbarHeight] = useState(0);

  useEffect(() => {
    const element = auxiliaryToolbarRef.current;
    if (!element) return;

    const updateHeight = () => {
      setAuxiliaryToolbarHeight(element.scrollHeight);
    };

    updateHeight();

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [auxiliaryToolbarRef]);

  useEffect(() => {
    if (!hasMessages) {
      setBottomBarVisible(true);
      return;
    }

    if (viewOnly) {
      setBottomBarVisible(false);
      return;
    }

    const root = scrollContainerRef.current;
    const target = toolbarVisibilityAnchorRef.current;
    if (!root || !target) {
      setBottomBarVisible(false);
      return;
    }

    const safeBottomOffset = Math.max(auxiliaryToolbarHeight + 16, 48);
    const observer = new IntersectionObserver(
      ([entry]) => {
        setBottomBarVisible(entry?.isIntersecting ?? false);
      },
      {
        root,
        threshold: 1,
        rootMargin: `0px 0px -${safeBottomOffset}px 0px`,
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [
    auxiliaryToolbarHeight,
    hasMessages,
    scrollContainerRef,
    toolbarVisibilityAnchorRef,
    viewOnly,
  ]);

  return {
    bottomBarVisible,
  };
}
