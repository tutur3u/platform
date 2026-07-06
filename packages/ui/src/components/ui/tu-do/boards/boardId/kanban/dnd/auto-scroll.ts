'use client';

import { useCallback, useEffect, useRef } from 'react';

export const KANBAN_EDGE_AUTO_SCROLL_THRESHOLD = 100;
const KANBAN_EDGE_AUTO_SCROLL_SPEED = 10;
const KANBAN_EDGE_AUTO_SCROLL_MAX_SPEED = 30;

interface HorizontalRect {
  left: number;
  right: number;
}

export function getKanbanEdgeAutoScrollAmount(
  pointerX: number | null,
  rect: HorizontalRect,
  options: {
    maxSpeed?: number;
    speed?: number;
    threshold?: number;
  } = {}
) {
  if (pointerX === null) return 0;

  const threshold = options.threshold ?? KANBAN_EDGE_AUTO_SCROLL_THRESHOLD;
  const speed = options.speed ?? KANBAN_EDGE_AUTO_SCROLL_SPEED;
  const maxSpeed = options.maxSpeed ?? KANBAN_EDGE_AUTO_SCROLL_MAX_SPEED;

  if (pointerX <= rect.left + threshold) {
    const distanceFromLeft = Math.max(0, pointerX - rect.left);
    const intensity = 1 - distanceFromLeft / threshold;
    return -Math.min(speed + intensity * (maxSpeed - speed), maxSpeed);
  }

  if (pointerX >= rect.right - threshold) {
    const distanceFromRight = Math.max(0, rect.right - pointerX);
    const intensity = 1 - distanceFromRight / threshold;
    return Math.min(speed + intensity * (maxSpeed - speed), maxSpeed);
  }

  return 0;
}

export function useAutoScroll(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
) {
  const autoScrollRafRef = useRef<number | null>(null);
  const isAutoScrollActiveRef = useRef(false);
  const pointerXRef = useRef<number | null>(null);

  const stopAutoScroll = useCallback(() => {
    isAutoScrollActiveRef.current = false;
    pointerXRef.current = null;

    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const autoScroll = useCallback(() => {
    if (!isAutoScrollActiveRef.current || !scrollContainerRef.current) {
      autoScrollRafRef.current = null;
      return;
    }

    const container = scrollContainerRef.current;
    const scrollAmount = getKanbanEdgeAutoScrollAmount(
      pointerXRef.current,
      container.getBoundingClientRect()
    );

    if (scrollAmount !== 0) {
      container.scrollLeft += scrollAmount;
    }

    autoScrollRafRef.current = requestAnimationFrame(autoScroll);
  }, [scrollContainerRef]);

  const startAutoScroll = useCallback(() => {
    isAutoScrollActiveRef.current = true;

    if (autoScrollRafRef.current === null) {
      autoScrollRafRef.current = requestAnimationFrame(autoScroll);
    }
  }, [autoScroll]);

  const updateAutoScrollPointerX = useCallback((pointerX: number | null) => {
    pointerXRef.current = pointerX;
  }, []);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  return {
    autoScrollRafRef,
    startAutoScroll,
    stopAutoScroll,
    updateAutoScrollPointerX,
  };
}
