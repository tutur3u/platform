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

    // Track if redistribution is needed
    let redistributionScheduled = false;

    const scheduleRedistribution = () => {
      if (redistributionScheduled) return;
      redistributionScheduled = true;

      requestAnimationFrame(() => {
        redistributionScheduled = false;
        setRedistributionKey((prev) => prev + 1);
      });
    };

    // Create new ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      let hasChanges = false;

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

        // Only update if height changed significantly (> 1px to avoid float precision issues)
        if (height > 0 && Math.abs(height - previousHeight) > 1) {
          itemHeightsRef.current.set(itemIndex, height);
          hasChanges = true;
        }
      }

      // Schedule redistribution if changes detected
      if (hasChanges) {
        scheduleRedistribution();
      }
    });

    // Observe all masonry items after initial render
    requestAnimationFrame(() => {
      const items = containerRef.current?.querySelectorAll(
        '[data-masonry-item]'
      );
      if (!items) return;

      items.forEach((item) => {
        if (item instanceof HTMLElement) {
          resizeObserver.observe(item);
        }
      });
    });

    resizeObserverRef.current = resizeObserver;

    return () => {
      resizeObserver.disconnect();
      resizeObserverRef.current = null;
    };
  }, [strategy, children.length, currentColumns]);

  // Reset heights when children or columns change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on structural changes
  useEffect(() => {
    if (strategy === 'balanced') {
      itemHeightsRef.current.clear();
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

  // Helper: Calculate variance of column heights
  const calculateVariance = (heights: number[]): number => {
    const mean = heights.reduce((sum, h) => sum + h, 0) / heights.length;
    const variance =
      heights.reduce((sum, h) => sum + (h - mean) ** 2, 0) / heights.length;
    return Math.sqrt(variance) / mean; // Coefficient of variation
  };

  // Memoized distribution calculation with improved algorithm
  // biome-ignore lint/correctness/useExhaustiveDependencies: redistributionKey triggers recalculation, calculateVariance is stable
  const columnWrappers = useMemo(() => {
    const wrappers: ReactNode[][] = Array.from(
      { length: currentColumns },
      () => []
    );

    if (strategy === 'balanced' && itemHeightsRef.current.size > 0) {
      // Use measured heights for distribution with improved greedy algorithm
      const columnHeights = Array(currentColumns).fill(0);

      children.forEach((child, index) => {
        // Get item height with fallback to running average
        let effectiveHeight = itemHeightsRef.current.get(index);
        if (effectiveHeight === undefined || effectiveHeight <= 0) {
          effectiveHeight = getAverageHeight;
        }

        // Find the shortest column with improved tie-breaking
        let shortestColumnIndex = 0;
        let minHeight = columnHeights[0] ?? 0;

        for (let i = 1; i < currentColumns; i++) {
          const height = columnHeights[i] ?? 0;
          // Use threshold-based comparison for better balance
          // Prefer earlier columns when heights are very close (within threshold)
          if (height < minHeight - minHeight * balanceThreshold) {
            minHeight = height;
            shortestColumnIndex = i;
          }
        }

        // Add item to shortest column
        const column = wrappers[shortestColumnIndex];
        if (column) {
          column.push(child);
          // Update column height including gap
          columnHeights[shortestColumnIndex] += effectiveHeight + gap;
        }
      });

      // Check if redistribution achieved good balance
      const variance = calculateVariance(columnHeights);
      if (variance > 0.1) {
        // Variance too high, but we've done our best with greedy
        // Could log for debugging: console.debug('Column variance:', variance)
      }
    } else {
      // Use item count for distribution (default or during initial measurement)
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
    }

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
