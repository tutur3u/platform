import { useCallback, useEffect, useRef } from 'react';

interface UseHorizontalScrollOptions {
  scrollSpeed?: number;
  enableTouchScroll?: boolean;
  enableMouseWheel?: boolean;
  isDragActive?: () => boolean; // Function to check if drag is active
}

export function useHorizontalScroll({
  scrollSpeed = 0.5,
  enableTouchScroll = true,
  enableMouseWheel = true,
  isDragActive,
}: UseHorizontalScrollOptions = {}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const dragStartTime = useRef(0);
  const minimumDragDistance = 5; // Minimum pixels to move before starting scroll
  const minimumDragTime = 150; // Minimum ms to hold before starting scroll

  // Handle mouse wheel for horizontal scrolling
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!scrollContainerRef.current || !enableMouseWheel) return;

      // Don't interfere with drag and drop operations
      if (isDragActive?.()) return;

      // Check if the user is scrolling vertically with shift key or if deltaX is present
      const isHorizontalScroll =
        e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);

      if (isHorizontalScroll) {
        // Check if we're currently in a drag operation by checking for active elements
        const hasActiveDraggable =
          document.querySelector('[data-sortable-id][style*="transform"]') ||
          document.querySelector('[draggable="true"][style*="transform"]');

        if (hasActiveDraggable) return;

        e.preventDefault();
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        scrollContainerRef.current.scrollLeft += delta * scrollSpeed;
      }
    },
    [scrollSpeed, enableMouseWheel, isDragActive]
  );

  // Touch/mouse drag scrolling
  const handleMouseDown = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!scrollContainerRef.current || !enableTouchScroll) return;

      // Don't interfere with drag and drop operations
      if (isDragActive?.()) return;

      // Check if the target has draggable attributes (dnd-kit elements)
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-rbd-draggable-id]') ||
        target.closest('[draggable="true"]') ||
        target.closest('[data-sortable-id]') ||
        target.closest('[data-dnd-id]') ||
        target.closest('[role="button"]') ||
        target.closest('button') ||
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('select') ||
        target.closest('a') ||
        target.closest('[data-id]') || // Task cards have data-id
        target.closest('.task-card') || // Generic task card class
        target.hasAttribute('draggable') ||
        target.closest('[data-testid*="task"]') ||
        // Check for any element that might be part of a draggable component
        (target.closest('*[class*="task"]') &&
          target.closest('*[class*="card"]'))
      ) {
        return;
      }

      // Only allow scrolling from the background/container areas
      const isBackgroundArea =
        target === scrollContainerRef.current ||
        target.classList.contains('gap-4') ||
        !target.closest('[data-id]');

      if (!isBackgroundArea) {
        return;
      }

      isDragging.current = true;
      dragStartTime.current = Date.now();
      scrollContainerRef.current.style.cursor = 'grabbing';
      scrollContainerRef.current.style.userSelect = 'none';

      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      if (clientX === undefined) return;

      startX.current = clientX;
      scrollLeft.current = scrollContainerRef.current.scrollLeft;
    },
    [enableTouchScroll, isDragActive]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current || !scrollContainerRef.current) return;

      // Stop scrolling if drag becomes active or if there are active draggable elements
      if (isDragActive?.()) {
        isDragging.current = false;
        scrollContainerRef.current.style.cursor = 'grab';
        scrollContainerRef.current.style.userSelect = '';
        return;
      }

      // Additional check for active drag elements in the DOM
      const hasActiveDraggable =
        document.querySelector('[data-sortable-id][style*="transform"]') ||
        document.querySelector('[draggable="true"][style*="transform"]') ||
        document.querySelector('.dnd-overlay');

      if (hasActiveDraggable) {
        isDragging.current = false;
        scrollContainerRef.current.style.cursor = 'grab';
        scrollContainerRef.current.style.userSelect = '';
        return;
      }

      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      if (clientX === undefined) return;

      const x = clientX;
      const deltaX = Math.abs(x - startX.current);
      const timeSinceStart = Date.now() - dragStartTime.current;

      // Only start scrolling if we've moved enough distance and enough time has passed
      // This prevents accidental scrolling during quick clicks or drag starts
      if (deltaX < minimumDragDistance || timeSinceStart < minimumDragTime) {
        return;
      }

      const walk = (x - startX.current) * 2; // Adjust scroll speed
      scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
    },
    [isDragActive]
  );

  const handleMouseUp = useCallback(() => {
    if (!scrollContainerRef.current) return;

    isDragging.current = false;
    scrollContainerRef.current.style.cursor = 'grab';
    scrollContainerRef.current.style.userSelect = '';
  }, []);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    // Add event listeners
    if (enableMouseWheel) {
      scrollContainer.addEventListener('wheel', handleWheel, {
        passive: false,
      });
    }

    if (enableTouchScroll) {
      scrollContainer.addEventListener('mousedown', handleMouseDown);
      scrollContainer.addEventListener('touchstart', handleMouseDown, {
        passive: true,
      });

      // Add global listeners for mouse/touch move and up
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('touchmove', handleMouseMove, {
        passive: false,
      });
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      if (enableMouseWheel) {
        scrollContainer.removeEventListener('wheel', handleWheel);
      }

      if (enableTouchScroll) {
        scrollContainer.removeEventListener('mousedown', handleMouseDown);
        scrollContainer.removeEventListener('touchstart', handleMouseDown);

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('touchmove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchend', handleMouseUp);
      }
    };
  }, [
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    enableMouseWheel,
    enableTouchScroll,
  ]);

  return {
    scrollContainerRef,
    isDragging: isDragging.current,
  };
}
