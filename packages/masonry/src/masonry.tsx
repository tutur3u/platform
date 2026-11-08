'use client';

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { distributeBalanced, distributeByCount } from './distribute.js';

interface MasonryProps {
  children: ReactNode[];
  columns?: number;
  gap?: number;
  breakpoints?: {
    [key: number]: number;
  };
  className?: string;
  /**
   * Strategy for distributing items across columns
   * - 'balanced': Distribute based on actual measured heights for better visual balance
   * - 'count': Distribute based on item count (faster, no layout shift, default)
   */
  strategy?: 'balanced' | 'count';
  /**
   * Balance threshold for redistribution (0-1)
   * Only redistributes when column height variance exceeds this threshold
   * @default 0.05 (5%)
   */
  balanceThreshold?: number;
  /**
   * Enable smooth CSS transitions during redistribution
   * @default false
   */
  smoothTransitions?: boolean;
}

/**
 * Masonry component for creating a Pinterest-style grid layout
 * Uses an optimized "shortest column" algorithm to distribute items evenly
 *
 * @example
 * ```tsx
 * <Masonry columns={3} gap={16}>
 *   <div>Item 1</div>
 *   <div>Item 2</div>
 *   <div>Item 3</div>
 * </Masonry>
 * ```
 */
export function Masonry({
  children,
  columns = 3,
  gap = 16,
  breakpoints,
  className = '',
  strategy = 'count',
  balanceThreshold: _balanceThreshold = 0.05,
  smoothTransitions = false,
}: MasonryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentColumns, setCurrentColumns] = useState(columns);
  const currentColumnsRef = useRef(currentColumns);
  const itemHeightsRef = useRef<Map<number, number>>(new Map());
  const [redistributionKey, setRedistributionKey] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const redistributionCountRef = useRef(0);
  const imagesLoadedRef = useRef(false);

  // Keep ref in sync with state
  currentColumnsRef.current = currentColumns;

  // Memoize sorted breakpoints so the resize handler doesn't re-sort every call
  const sortedBreakpoints = useMemo(() => {
    if (!breakpoints || Object.keys(breakpoints).length === 0) return null;
    return Object.entries(breakpoints).sort(
      ([a], [b]) => Number(b) - Number(a)
    );
  }, [breakpoints]);

  // Handle responsive breakpoints — ref-based handler avoids re-registration on column changes
  useEffect(() => {
    if (!sortedBreakpoints) {
      setCurrentColumns(columns);
      return;
    }

    const handleResize = () => {
      const width = window.innerWidth;
      let cols = columns;

      for (const [breakpoint, breakpointColumns] of sortedBreakpoints) {
        if (width >= Number(breakpoint)) {
          cols = breakpointColumns;
          break;
        }
      }

      if (cols !== currentColumnsRef.current) {
        setCurrentColumns(cols);
        if (strategy === 'balanced') {
          itemHeightsRef.current.clear();
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [columns, sortedBreakpoints, strategy]);

  // ResizeObserver-based measurement for balanced strategy.
  // Merged: reset heights + observe items + debounce redistribution in one effect.
  useEffect(() => {
    if (strategy !== 'balanced') return;

    if (typeof ResizeObserver === 'undefined') {
      console.warn(
        'ResizeObserver not available, falling back to count strategy'
      );
      return;
    }

    // Cleanup existing observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }

    // Reset tracking on (re)mount — merged from the standalone reset effect
    itemHeightsRef.current.clear();
    redistributionCountRef.current = 0;
    imagesLoadedRef.current = false;
    setRedistributionKey((prev) => prev + 1);

    // Track redistribution state
    let redistributionScheduled = false;
    let redistributionTimeout: ReturnType<typeof setTimeout> | null = null;
    let stableCheckTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingChanges = false;
    let lastChangeTimestamp = Date.now();

    const scheduleRedistribution = () => {
      if (redistributionCountRef.current >= 10 || imagesLoadedRef.current) {
        return;
      }

      if (redistributionScheduled) {
        pendingChanges = true;
        return;
      }

      redistributionScheduled = true;
      pendingChanges = false;
      lastChangeTimestamp = Date.now();

      if (redistributionTimeout) {
        clearTimeout(redistributionTimeout);
      }

      redistributionTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
          redistributionScheduled = false;
          redistributionCountRef.current++;
          setRedistributionKey((prev) => prev + 1);

          if (pendingChanges && redistributionCountRef.current < 10) {
            scheduleRedistribution();
          }
        });
      }, 150);
    };

    const checkStability = () => {
      if (stableCheckTimeout) {
        clearTimeout(stableCheckTimeout);
      }

      stableCheckTimeout = setTimeout(() => {
        const timeSinceLastChange = Date.now() - lastChangeTimestamp;
        if (timeSinceLastChange >= 1500) {
          imagesLoadedRef.current = true;
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
            resizeObserverRef.current = null;
          }
        }
      }, 1500);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      if (redistributionCountRef.current >= 10 || imagesLoadedRef.current) {
        return;
      }

      let hasSignificantChanges = false;

      for (const entry of entries) {
        const element = entry.target;
        if (!(element instanceof HTMLElement)) continue;

        const itemIndex = Number.parseInt(
          element.getAttribute('data-item-index') ?? '0',
          10
        );

        const height = entry.contentRect.height || element.offsetHeight;
        const previousHeight = itemHeightsRef.current.get(itemIndex) || 0;

        if (height > 0 && Math.abs(height - previousHeight) > 10) {
          itemHeightsRef.current.set(itemIndex, height);
          hasSignificantChanges = true;
        }
      }

      if (hasSignificantChanges) {
        scheduleRedistribution();
        checkStability();
      }
    });

    // Observe all masonry items and track image loading
    requestAnimationFrame(() => {
      const items = containerRef.current?.querySelectorAll(
        '[data-masonry-item]'
      );
      if (!items) return;

      let totalImages = 0;
      let loadedImages = 0;

      items.forEach((item) => {
        if (item instanceof HTMLElement) {
          resizeObserver.observe(item);

          const images = item.querySelectorAll('img');
          totalImages += images.length;

          images.forEach((img) => {
            if (img.complete && img.naturalHeight > 0) {
              loadedImages++;
            } else {
              const handleLoad = () => {
                loadedImages++;
                if (loadedImages >= totalImages) {
                  setTimeout(() => {
                    imagesLoadedRef.current = true;
                    if (resizeObserverRef.current) {
                      resizeObserverRef.current.disconnect();
                      resizeObserverRef.current = null;
                    }
                  }, 1000);
                }
              };
              img.addEventListener('load', handleLoad, { once: true });
              img.addEventListener('error', handleLoad, { once: true });
            }
          });
        }
      });

      if (totalImages > 0 && loadedImages >= totalImages) {
        setTimeout(() => {
          imagesLoadedRef.current = true;
        }, 1000);
      }
    });

    resizeObserverRef.current = resizeObserver;

    return () => {
      if (redistributionTimeout) {
        clearTimeout(redistributionTimeout);
      }
      if (stableCheckTimeout) {
        clearTimeout(stableCheckTimeout);
      }
      resizeObserver.disconnect();
      resizeObserverRef.current = null;
    };
  }, [strategy, children.length, currentColumns]);

  // Calculate average height from measured items
  const averageHeight = useMemo(() => {
    if (itemHeightsRef.current.size === 0) return 200;
    const measuredHeights = Array.from(itemHeightsRef.current.values()).filter(
      (h) => h > 0
    );
    if (measuredHeights.length === 0) return 200;
    return (
      measuredHeights.reduce((sum, h) => sum + h, 0) / measuredHeights.length
    );
  }, [redistributionKey]);

  // Memoized distribution — delegates to pure functions in distribute.ts
  const columnWrappers = useMemo(() => {
    if (strategy === 'balanced' && itemHeightsRef.current.size > 0) {
      return distributeBalanced(
        children,
        currentColumns,
        gap,
        itemHeightsRef.current,
        averageHeight
      );
    }
    return distributeByCount(children, currentColumns);
  }, [
    children,
    currentColumns,
    strategy,
    redistributionKey,
    gap,
    averageHeight,
  ]);

  const containerStyle: CSSProperties = {
    display: 'flex',
    gap: `${gap}px`,
    alignItems: 'flex-start',
  };

  const columnStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${gap}px`,
    flex: 1,
    contain: 'layout style',
    ...(smoothTransitions && {
      transition: 'all 0.3s ease-in-out',
    }),
  };

  const itemStyle: CSSProperties = {
    contain: 'layout style',
    ...(smoothTransitions && {
      transition: 'transform 0.3s ease-in-out',
    }),
  };

  return (
    <div ref={containerRef} style={containerStyle} className={className}>
      {columnWrappers.map((column, columnIndex) => (
        <div key={columnIndex} style={columnStyle}>
          {column.map((item) => (
            <div
              key={item.originalIndex}
              data-masonry-item
              data-item-index={item.originalIndex}
              style={itemStyle}
            >
              {item.child}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
