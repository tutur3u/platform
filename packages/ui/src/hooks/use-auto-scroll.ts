import { useCallback, useRef, useState } from 'react';

export interface AutoScrollOptions {
  containerRef?: React.RefObject<HTMLElement>;
  isDragging: boolean;
  scrollEdgeSize?: number;
  maxScrollSpeed?: number;
  minScrollSpeed?: number;
  throttleDelay?: number;
  acceleration?: number;
}

export interface ScrollIndicator {
  show: boolean;
  direction: 'up' | 'down' | null;
  position: { x: number; y: number };
}

export const useAutoScroll = ({
  containerRef,
  isDragging,
  scrollEdgeSize = 80,
  maxScrollSpeed = 20,
  minScrollSpeed = 3,
  throttleDelay = 16,
  acceleration = 0.1
}: AutoScrollOptions) => {
  // Auto-scroll state
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoScrollingRef = useRef(false);
  const scrollDirectionRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const scrollVelocityRef = useRef(0);

  // Auto-scroll indicator state
  const [scrollIndicator, setScrollIndicator] = useState<ScrollIndicator>({
    show: false,
    direction: null,
    position: { x: 0, y: 0 },
  });

  const handleAutoScroll = useCallback((clientX: number, clientY: number) => {
    // Find scrollable container
    const calendarView = document.getElementById('calendar-view');
    if (!calendarView) return;
    
    // Get scrollable element - use provided ref or find automatically
    let scrollElement: HTMLElement;
    if (containerRef?.current) {
      scrollElement = containerRef.current;
    } else {
      const scrollableElements = [];
      let element: HTMLElement | null = calendarView;
      while (element && element !== document.body) {
        const computedStyle = window.getComputedStyle(element);
        const hasVerticalScroll = element.scrollHeight > element.clientHeight;
        const canScroll = computedStyle.overflowY === 'auto' || computedStyle.overflowY === 'scroll';
        
        if (hasVerticalScroll && (canScroll || element === calendarView)) {
          scrollableElements.push(element);
        }
        element = element.parentElement;
      }
      scrollElement = scrollableElements[0] || calendarView;
    }
    
    const rect = scrollElement.getBoundingClientRect();
    const currentScrollTop = scrollElement.scrollTop;
    const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;
    
    // Calculate mouse position relative to scroll container
    const relativeY = clientY - rect.top;
    const distanceFromTop = Math.max(0, relativeY);
    const distanceFromBottom = Math.max(0, rect.height - relativeY);
    
    // Determine scroll direction and calculate speed based on proximity to edge
    let scrollDirection = 0;
    let indicatorDirection: 'up' | 'down' | null = null;
    let targetSpeed = 0;
    
    if (relativeY <= scrollEdgeSize && currentScrollTop > 0) {
      scrollDirection = -1;
      indicatorDirection = 'up';
      const proximityFactor = 1 - Math.min(1, distanceFromTop / scrollEdgeSize);
      targetSpeed = minScrollSpeed + (maxScrollSpeed - minScrollSpeed) * proximityFactor;
    } else if (relativeY >= rect.height - scrollEdgeSize && currentScrollTop < maxScrollTop) {
      scrollDirection = 1;
      indicatorDirection = 'down';
      const proximityFactor = 1 - Math.min(1, distanceFromBottom / scrollEdgeSize);
      targetSpeed = minScrollSpeed + (maxScrollSpeed - minScrollSpeed) * proximityFactor;
    }
    
    // Update scroll indicator
    if (scrollDirection !== 0) {
      setScrollIndicator({
        show: true,
        direction: indicatorDirection,
        position: { x: clientX, y: clientY },
      });
    } else {
      setScrollIndicator({
        show: false,
        direction: null,
        position: { x: 0, y: 0 },
      });
    }
    
    // Store scroll parameters in refs
    scrollDirectionRef.current = scrollDirection;
    targetSpeedRef.current = targetSpeed;
    
    // Start auto-scroll if not already running and we have a valid direction
    if (scrollDirection !== 0 && !isAutoScrollingRef.current) {
      isAutoScrollingRef.current = true;
      scrollVelocityRef.current = minScrollSpeed;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`Auto-scroll ${scrollDirection === -1 ? 'UP' : 'DOWN'} started`);
      }
      
      const performScroll = () => {
        // Get fresh scroll element state
        const currentElement = containerRef?.current || document.getElementById('calendar-view');
        if (!currentElement || !isDragging) {
          isAutoScrollingRef.current = false;
          scrollVelocityRef.current = 0;
          scrollDirectionRef.current = 0;
          targetSpeedRef.current = 0;
          setScrollIndicator({ show: false, direction: null, position: { x: 0, y: 0 } });
          return;
        }
        
        const currentScroll = currentElement.scrollTop;
        const maxScroll = currentElement.scrollHeight - currentElement.clientHeight;
        
        // Stop if we've reached scroll limits
        if ((scrollDirectionRef.current === -1 && currentScroll <= 0) ||
            (scrollDirectionRef.current === 1 && currentScroll >= maxScroll)) {
          isAutoScrollingRef.current = false;
          scrollVelocityRef.current = 0;
          scrollDirectionRef.current = 0;
          targetSpeedRef.current = 0;
          setScrollIndicator({ show: false, direction: null, position: { x: 0, y: 0 } });
          return;
        }
        
        // Accelerate smoothly if acceleration is enabled
        if (acceleration > 0 && scrollVelocityRef.current < targetSpeedRef.current) {
          scrollVelocityRef.current = Math.min(
            targetSpeedRef.current, 
            scrollVelocityRef.current + targetSpeedRef.current * acceleration
          );
        } else if (acceleration === 0) {
          scrollVelocityRef.current = targetSpeedRef.current;
        }
        
        // Perform scroll
        const scrollAmount = scrollDirectionRef.current * scrollVelocityRef.current;
        const newScroll = Math.max(0, Math.min(currentScroll + scrollAmount, maxScroll));
        currentElement.scrollTop = newScroll;
        
        // Continue scrolling
        autoScrollTimerRef.current = setTimeout(performScroll, throttleDelay);
      };
      
      performScroll();
    }
    
    // Stop auto-scroll if direction becomes 0
    if (scrollDirection === 0 && isAutoScrollingRef.current) {
      isAutoScrollingRef.current = false;
      scrollVelocityRef.current = 0;
      scrollDirectionRef.current = 0;
      targetSpeedRef.current = 0;
      if (autoScrollTimerRef.current) {
        clearTimeout(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
      setScrollIndicator({ show: false, direction: null, position: { x: 0, y: 0 } });
    }
  }, [
    containerRef,
    isDragging,
    scrollEdgeSize,
    maxScrollSpeed,
    minScrollSpeed,
    throttleDelay,
    acceleration
  ]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (autoScrollTimerRef.current) {
      clearTimeout(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
    isAutoScrollingRef.current = false;
    scrollVelocityRef.current = 0;
    scrollDirectionRef.current = 0;
    targetSpeedRef.current = 0;
    setScrollIndicator({ show: false, direction: null, position: { x: 0, y: 0 } });
  }, []);

  return {
    handleAutoScroll,
    scrollIndicator,
    cleanup
  };
}; 