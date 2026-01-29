'use client';

import { useEffect, useRef } from 'react';

export function useAutoScroll(
  isDraggingRef: React.MutableRefObject<boolean>,
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
) {
  const autoScrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    const EDGE_THRESHOLD = 100; // Distance from edge to trigger scroll (px)
    const SCROLL_SPEED = 10; // Base scroll speed (px per frame)
    const MAX_SCROLL_SPEED = 30; // Maximum scroll speed (px per frame)

    let currentPointerX = 0;

    function handlePointerMove(event: PointerEvent) {
      currentPointerX = event.clientX;
    }

    function autoScroll() {
      if (!isDraggingRef.current || !scrollContainerRef.current) {
        autoScrollRafRef.current = null;
        return;
      }

      const container = scrollContainerRef.current;
      const rect = container.getBoundingClientRect();

      // Calculate distance from edges
      const distanceFromLeft = currentPointerX - rect.left;
      const distanceFromRight = rect.right - currentPointerX;

      let scrollAmount = 0;

      // Scroll left when near left edge
      if (distanceFromLeft < EDGE_THRESHOLD && distanceFromLeft > 0) {
        const intensity = 1 - distanceFromLeft / EDGE_THRESHOLD;
        scrollAmount = -Math.min(
          SCROLL_SPEED + intensity * (MAX_SCROLL_SPEED - SCROLL_SPEED),
          MAX_SCROLL_SPEED
        );
      }
      // Scroll right when near right edge
      else if (distanceFromRight < EDGE_THRESHOLD && distanceFromRight > 0) {
        const intensity = 1 - distanceFromRight / EDGE_THRESHOLD;
        scrollAmount = Math.min(
          SCROLL_SPEED + intensity * (MAX_SCROLL_SPEED - SCROLL_SPEED),
          MAX_SCROLL_SPEED
        );
      }

      // Apply scroll if needed
      if (scrollAmount !== 0) {
        container.scrollLeft += scrollAmount;
      }

      // Continue the animation loop
      autoScrollRafRef.current = requestAnimationFrame(autoScroll);
    }

    // Start auto-scroll loop when dragging starts (triggered by isDraggingRef)
    window.addEventListener('pointermove', handlePointerMove);

    // Watch for drag start to initialize auto-scroll loop
    const startAutoScrollLoop = () => {
      if (isDraggingRef.current && !autoScrollRafRef.current) {
        autoScrollRafRef.current = requestAnimationFrame(autoScroll);
      }
    };

    // Poll for drag start (alternative: trigger from onDragStart)
    const pollInterval = setInterval(startAutoScrollLoop, 100);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      clearInterval(pollInterval);
      if (autoScrollRafRef.current) {
        cancelAnimationFrame(autoScrollRafRef.current);
      }
    };
  }, [isDraggingRef, scrollContainerRef]);

  return { autoScrollRafRef };
}
