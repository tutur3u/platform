'use client';

import type {
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { useCallback, useEffect, useRef } from 'react';

export const KANBAN_EDGE_AUTO_SCROLL_THRESHOLD = 100;
const KANBAN_EDGE_AUTO_SCROLL_SPEED = 10;
const KANBAN_EDGE_AUTO_SCROLL_MAX_SPEED = 30;

type KanbanDragAutoScrollEvent = DragMoveEvent | DragOverEvent | DragStartEvent;

interface HorizontalRect {
  left: number;
  right: number;
}

function getTouchListClientX(touches: unknown) {
  if (!touches || typeof touches !== 'object') return null;

  const list = touches as ArrayLike<{ clientX?: unknown }> & {
    item?: (index: number) => { clientX?: unknown } | null;
  };
  const touch = list.item?.(0) ?? list[0];

  return typeof touch?.clientX === 'number' ? touch.clientX : null;
}

function getPointerEventClientX(event: Event) {
  if ('clientX' in event && typeof event.clientX === 'number') {
    return event.clientX;
  }

  if ('touches' in event) {
    const touchX = getTouchListClientX(event.touches);
    if (touchX !== null) return touchX;
  }

  if ('changedTouches' in event) {
    return getTouchListClientX(event.changedTouches);
  }

  return null;
}

function getDragEventDeltaX(event: KanbanDragAutoScrollEvent) {
  return 'delta' in event && typeof event.delta?.x === 'number'
    ? event.delta.x
    : 0;
}

function getDragActiveCenterX(event: KanbanDragAutoScrollEvent) {
  const activeRect =
    event.active.rect.current.translated ?? event.active.rect.current.initial;

  return activeRect ? activeRect.left + activeRect.width / 2 : null;
}

export function getKanbanDragAutoScrollPointerX(
  event: KanbanDragAutoScrollEvent
) {
  const pointerStartX = getPointerEventClientX(event.activatorEvent);

  if (pointerStartX !== null) {
    return pointerStartX + getDragEventDeltaX(event);
  }

  return getDragActiveCenterX(event);
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
