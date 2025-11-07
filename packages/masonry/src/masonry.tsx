'use client';

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
  balanceThreshold = 0.05,
  smoothTransitions = false,
}: MasonryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentColumns, setCurrentColumns] = useState(columns);
  const itemHeightsRef = useRef<Map<number, number>>(new Map());
  const [redistributionKey, setRedistributionKey] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const redistributionCountRef = useRef(0);
  const imagesLoadedRef = useRef(false);

  // Handle responsive breakpoints
  useEffect(() => {
    if (!breakpoints || Object.keys(breakpoints).length === 0) {
      setCurrentColumns(columns);
      return;
    }

    const handleResize = () => {
      const width = window.innerWidth;
      let cols = columns;

      // Find the appropriate number of columns based on breakpoints
      const sortedBreakpoints = Object.entries(breakpoints).sort(
        ([a], [b]) => Number(b) - Number(a)
      );

      for (const [breakpoint, breakpointColumns] of sortedBreakpoints) {
        if (width >= Number(breakpoint)) {
          cols = breakpointColumns;
          break;
        }
      }

      if (cols !== currentColumns) {
        setCurrentColumns(cols);
        if (strategy === 'balanced') {
          itemHeightsRef.current.clear();
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [columns, breakpoints, currentColumns, strategy]);

  // Modern ResizeObserver-based measurement for balanced strategy
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run when children count changes
  useEffect(() => {
    if (strategy !== 'balanced') return;

    // Check if ResizeObserver is available
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

    // Reset tracking on remount
    redistributionCountRef.current = 0;
    imagesLoadedRef.current = false;

    // Track redistribution state
    let redistributionScheduled = false;
    let redistributionTimeout: ReturnType<typeof setTimeout> | null = null;
    let stableCheckTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingChanges = false;
    let lastChangeTimestamp = Date.now();

    const scheduleRedistribution = () => {
      // Stop redistributing after a reasonable number of attempts or if images are loaded
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

      // Clear any existing timeout
      if (redistributionTimeout) {
        clearTimeout(redistributionTimeout);
      }

      // Longer debounce to ensure stability - wait 500ms after last change
      redistributionTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
          redistributionScheduled = false;
          redistributionCountRef.current++;
          setRedistributionKey((prev) => prev + 1);

          // If more changes came in during debounce and we haven't hit the limit, schedule again
          if (pendingChanges && redistributionCountRef.current < 10) {
            scheduleRedistribution();
          }
        });
      }, 500);
    };

    // Check if layout is stable and stop observing
    const checkStability = () => {
      if (stableCheckTimeout) {
        clearTimeout(stableCheckTimeout);
      }

      stableCheckTimeout = setTimeout(() => {
        const timeSinceLastChange = Date.now() - lastChangeTimestamp;
        // If no changes for 2 seconds, consider layout stable and stop observing
        if (timeSinceLastChange >= 2000) {
          imagesLoadedRef.current = true;
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
            resizeObserverRef.current = null;
          }
        }
      }, 2000);
    };

    // Create new ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      // Don't process if we've hit limits
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

        // Use contentRect for accurate measurement
        const height = entry.contentRect.height || element.offsetHeight;
        const previousHeight = itemHeightsRef.current.get(itemIndex) || 0;

        // Much higher threshold - only update if height changed by more than 10px
        // This prevents redistribution from minor changes
        if (height > 0 && Math.abs(height - previousHeight) > 10) {
          itemHeightsRef.current.set(itemIndex, height);
          hasSignificantChanges = true;
        }
      }

      // Schedule redistribution if significant changes detected
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

          // Track image loading
          const images = item.querySelectorAll('img');
          totalImages += images.length;

          images.forEach((img) => {
            if (img.complete && img.naturalHeight > 0) {
              loadedImages++;
            } else {
              const handleLoad = () => {
                loadedImages++;
                if (loadedImages >= totalImages) {
                  // All images loaded - wait a bit then stop observing
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

      // If all images already loaded, mark as complete
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

  // Reset heights when children or columns change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on structural changes
  useEffect(() => {
    if (strategy === 'balanced') {
      itemHeightsRef.current.clear();
      redistributionCountRef.current = 0;
      imagesLoadedRef.current = false;
      setRedistributionKey((prev) => prev + 1);
    }
  }, [children.length, currentColumns, strategy]);

  // Helper: Calculate average height from measured items
  // biome-ignore lint/correctness/useExhaustiveDependencies: redistributionKey triggers intentional recalculation
  const getAverageHeight = useMemo(() => {
    if (itemHeightsRef.current.size === 0) return 200;
    const measuredHeights = Array.from(itemHeightsRef.current.values()).filter(
      (h) => h > 0
    );
    if (measuredHeights.length === 0) return 200;
    return (
      measuredHeights.reduce((sum, h) => sum + h, 0) / measuredHeights.length
    );
  }, [redistributionKey]);

  // Helper: Distribute items with hybrid algorithm (Min-Max + Post-Optimization)
  const distributeItems = (items: ReactNode[]): ReactNode[][] => {
    // Build item metadata with heights
    interface ItemMetadata {
      child: ReactNode;
      originalIndex: number;
      height: number;
    }

    const itemsWithHeights: ItemMetadata[] = items.map((child, index) => {
      let effectiveHeight = itemHeightsRef.current.get(index);
      if (effectiveHeight === undefined || effectiveHeight <= 0) {
        effectiveHeight = getAverageHeight;
      }
      return { child, originalIndex: index, height: effectiveHeight };
    });

    // Sort items by height in descending order (Largest First)
    const sortedItems = [...itemsWithHeights].sort(
      (a, b) => b.height - a.height
    );

    // Track which column each item is assigned to
    const columnAssignments: number[] = [];
    const columnHeights = Array(currentColumns).fill(0);

    // Helper: Calculate the range (max - min) of column heights
    const getHeightRange = (heights: number[]): number => {
      const max = Math.max(...heights);
      const min = Math.min(...heights);
      return max - min;
    };

    // Phase 1: Initial Min-Max greedy placement
    sortedItems.forEach((item, itemIndex) => {
      let bestColumnIndex = 0;
      let bestRange = Number.POSITIVE_INFINITY;

      // Try placing item in each column and pick the one that minimizes height range
      for (let i = 0; i < currentColumns; i++) {
        const testHeights = [...columnHeights];
        testHeights[i] += item.height + gap;

        const range = getHeightRange(testHeights);

        if (range < bestRange - 1) {
          bestRange = range;
          bestColumnIndex = i;
        } else if (Math.abs(range - bestRange) <= 1) {
          if (columnHeights[i] < columnHeights[bestColumnIndex]) {
            bestColumnIndex = i;
          }
        }
      }

      // Assign item to best column
      columnAssignments[itemIndex] = bestColumnIndex;
      columnHeights[bestColumnIndex] += item.height + gap;
    });

    // Phase 2: Global optimization - try moving ANY item to ANY column
    let improved = true;
    let passCount = 0;
    const maxPasses = 20; // More passes for exhaustive search

    while (improved && passCount < maxPasses) {
      improved = false;
      passCount++;

      const currentRange = getHeightRange(columnHeights);

      // Stop if already well balanced (tighter threshold: 1% or 10px)
      const minHeight = Math.min(...columnHeights);
      if (currentRange < Math.max(10, minHeight * 0.01)) {
        break;
      }

      let bestMoveImprovement = 0;
      let bestMoveItemIndex = -1;
      let bestMoveTargetCol = -1;
      let bestMoveNewHeights: number[] = [];

      // Try moving EVERY item to EVERY other column (exhaustive search)
      for (let i = 0; i < sortedItems.length; i++) {
        const item = sortedItems[i];
        if (!item) continue;

        const currentCol = columnAssignments[i];
        if (currentCol === undefined) continue;

        // Try moving this item to every other column
        for (let targetCol = 0; targetCol < currentColumns; targetCol++) {
          if (targetCol === currentCol) continue;

          // Calculate what would happen if we moved this item
          const newHeights = [...columnHeights];
          newHeights[currentCol] -= item.height + gap;
          newHeights[targetCol] += item.height + gap;

          const newRange = getHeightRange(newHeights);
          const improvement = currentRange - newRange;

          // Track best move (accept any positive improvement)
          if (improvement > bestMoveImprovement) {
            bestMoveImprovement = improvement;
            bestMoveItemIndex = i;
            bestMoveTargetCol = targetCol;
            bestMoveNewHeights = newHeights;
          }
        }
      }

      // Apply the best move if it improves balance
      if (
        bestMoveImprovement > 0 &&
        bestMoveItemIndex >= 0 &&
        bestMoveTargetCol >= 0
      ) {
        columnHeights.splice(0, columnHeights.length, ...bestMoveNewHeights);
        columnAssignments[bestMoveItemIndex] = bestMoveTargetCol;
        improved = true;
      }
    }

    // Phase 3: Build final wrappers from optimized assignments
    const wrappers: ReactNode[][] = Array.from(
      { length: currentColumns },
      () => []
    );

    sortedItems.forEach((item, index) => {
      const columnIndex = columnAssignments[index];
      if (columnIndex !== undefined) {
        const column = wrappers[columnIndex];
        if (column) {
          column.push(item.child);
        }
      }
    });

    return wrappers;
  };

  // Memoized distribution calculation with multi-pass optimization
  // biome-ignore lint/correctness/useExhaustiveDependencies: redistributionKey triggers recalculation, calculateVariance is stable
  const columnWrappers = useMemo(() => {
    if (strategy === 'balanced' && itemHeightsRef.current.size > 0) {
      // Use measured heights with optimization
      return distributeItems(children);
    }

    // Use item count for distribution (default or during initial measurement)
    const wrappers: ReactNode[][] = Array.from(
      { length: currentColumns },
      () => []
    );
    const columnItemCounts = Array(currentColumns).fill(0);

    children.forEach((child) => {
      // Find the column with the fewest items
      let shortestColumnIndex = 0;
      let minCount = columnItemCounts[0] ?? 0;

      for (let i = 1; i < currentColumns; i++) {
        const count = columnItemCounts[i] ?? 0;
        // Strict < ensures deterministic distribution
        if (count < minCount) {
          minCount = count;
          shortestColumnIndex = i;
        }
      }

      // Add item to column
      const column = wrappers[shortestColumnIndex];
      if (column) {
        column.push(child);
        columnItemCounts[shortestColumnIndex]++;
      }
    });

    return wrappers;
  }, [
    children,
    currentColumns,
    strategy,
    redistributionKey,
    balanceThreshold,
    gap,
    getAverageHeight,
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
    ...(smoothTransitions && {
      transition: 'all 0.3s ease-in-out',
    }),
  };

  const itemStyle: CSSProperties = smoothTransitions
    ? {
        transition: 'transform 0.3s ease-in-out',
      }
    : {};

  return (
    <div ref={containerRef} style={containerStyle} className={className}>
      {columnWrappers.map((column, columnIndex) => (
        <div key={columnIndex} style={columnStyle}>
          {column.map((child, itemIndex) => {
            // Calculate global index for consistent keys
            const globalIndex =
              columnWrappers
                .slice(0, columnIndex)
                .reduce((acc, col) => acc + col.length, 0) + itemIndex;

            return (
              <div
                key={globalIndex}
                data-masonry-item
                data-item-index={globalIndex}
                style={itemStyle}
              >
                {child}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
