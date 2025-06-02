'use client';

import { useCallback, useState } from 'react';

export type CalendarView = 'day' | '4-days' | 'week' | 'month';

export function useViewTransition() {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionType, setTransitionType] = useState<'fade' | 'slide'>(
    'fade'
  );
  const [direction, setDirection] = useState<'left' | 'right'>('right');

  const transition = useCallback(
    (newView: CalendarView, callback: () => void, oldView?: CalendarView) => {
      // Skip animation if no previous view
      if (!oldView) {
        callback();
        return;
      }

      // Determine transition type and direction
      const viewOrder: CalendarView[] = ['day', '4-days', 'week', 'month'];
      const oldIndex = viewOrder.indexOf(oldView);
      const newIndex = viewOrder.indexOf(newView);

      // Use slide for adjacent views, fade for non-adjacent
      if (Math.abs(newIndex - oldIndex) === 1) {
        setTransitionType('slide');
        setDirection(newIndex > oldIndex ? 'right' : 'left');
      } else {
        setTransitionType('fade');
      }

      setIsTransitioning(true);

      // Apply transition with slight delay
      setTimeout(() => {
        callback();

        // Reset transition state after animation completes
        setTimeout(() => {
          setIsTransitioning(false);
        }, 300);
      }, 50);
    },
    []
  );

  return {
    isTransitioning,
    transitionType,
    direction,
    transition,
  };
}
