'use client';

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
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
   * - 'balanced': Distribute based on actual measured heights for better visual balance (may cause initial layout shift)
   * - 'count': Distribute based on item count (faster, no layout shift, default)
   */
  strategy?: 'balanced' | 'count';
}

/**
 * Masonry component for creating a Pinterest-style grid layout
 * Uses a "shortest column" algorithm to distribute items evenly
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
  breakpoints = {
    640: 1,
    768: 2,
    1024: 3,
    1280: 4,
  },
  className = '',
  strategy = 'count',
}: MasonryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentColumns, setCurrentColumns] = useState(columns);
  const itemHeightsRef = useRef<Map<number, number>>(new Map());
  const [isInitialized, setIsInitialized] = useState(strategy !== 'balanced');
  const [, forceUpdate] = useState(0);
  const imagesLoadingRef = useRef<{
    total: number;
    loaded: number;
  }>({ total: 0, loaded: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const measurementAttemptsRef = useRef(0);
  const lastMeasurementRef = useRef<string>(''); // Track measurement hash to detect changes

  useEffect(() => {
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

      setCurrentColumns(cols);

      // Reset initialization on column change
      if (strategy === 'balanced' && cols !== currentColumns) {
        setIsInitialized(false);
      }
    };

    // Only run resize logic if breakpoints are provided
    if (Object.keys(breakpoints).length > 0) {
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    } else {
      setCurrentColumns(columns);
    }
  }, [columns, breakpoints, currentColumns, strategy]);

  // Measure individual item heights and setup periodic redistribution
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run when children count changes
  useEffect(() => {
    if (strategy !== 'balanced') return;
    if (isInitialized) return; // Already set up

    // Cleanup any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Reset measurement tracking
    measurementAttemptsRef.current = 0;
    lastMeasurementRef.current = '';

    const measureHeights = () => {
      const items = containerRef.current?.querySelectorAll(
        '[data-masonry-item]'
      );

      if (!items || items.length === 0) return false;

      // Initialize tracking
      imagesLoadingRef.current = { total: 0, loaded: 0 };

      // Count total images and preload check
      items.forEach((item) => {
        const images = item.querySelectorAll('img');
        imagesLoadingRef.current.total += images.length;
      });

      // Measure all items and validate measurements
      let allMeasurementsValid = true;
      const newHeights: number[] = [];

      items.forEach((item) => {
        if (item instanceof HTMLElement) {
          const itemIndex = Number.parseInt(
            item.getAttribute('data-item-index') ?? '0',
            10
          );

          // Get bounding rect for more accurate measurement
          const rect = item.getBoundingClientRect();
          const height = rect.height || item.offsetHeight;

          // Validate height measurement
          if (height <= 0) {
            allMeasurementsValid = false;
          } else {
            itemHeightsRef.current.set(itemIndex, height);
            newHeights.push(height);
          }
        }
      });

      // Create measurement hash to detect actual changes
      const measurementHash = newHeights.join(',');
      lastMeasurementRef.current = measurementHash;

      // Show immediately after first valid measurement
      if (
        !isInitialized &&
        allMeasurementsValid &&
        itemHeightsRef.current.size > 0
      ) {
        setIsInitialized(true);
      }

      // If no images, we're done after first valid measurement
      if (imagesLoadingRef.current.total === 0 && allMeasurementsValid) {
        return true; // All done
      }

      return false; // Continue measuring
    };

    // Perform initial measurement
    const initialComplete = measureHeights();

    if (initialComplete) {
      return; // No need for interval
    }

    // Set up periodic redistribution while images are loading
    intervalRef.current = setInterval(() => {
      measurementAttemptsRef.current++;

      // Measure all items with current heights
      const items = containerRef.current?.querySelectorAll(
        '[data-masonry-item]'
      );

      if (!items) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      let hasChanges = false;
      const newHeights: number[] = [];

      items.forEach((item) => {
        if (item instanceof HTMLElement) {
          const itemIndex = Number.parseInt(
            item.getAttribute('data-item-index') ?? '0',
            10
          );

          const rect = item.getBoundingClientRect();
          const height = rect.height || item.offsetHeight;
          const previousHeight = itemHeightsRef.current.get(itemIndex) || 0;

          // Only update if height has changed significantly (more than 1px to avoid float precision issues)
          if (height > 0 && Math.abs(height - previousHeight) > 1) {
            itemHeightsRef.current.set(itemIndex, height);
            hasChanges = true;
          }

          newHeights.push(height);
        }
      });

      // Only trigger redistribution if heights actually changed
      if (hasChanges) {
        forceUpdate((n) => n + 1);
      }

      // Stop conditions
      const allImagesLoaded =
        imagesLoadingRef.current.loaded >= imagesLoadingRef.current.total;
      const maxAttemptsReached = measurementAttemptsRef.current > 50; // Safety limit: 5 seconds

      if ((allImagesLoaded && !hasChanges) || maxAttemptsReached) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 100); // Recalculate every 100ms

    // Setup image load handlers
    requestAnimationFrame(() => {
      const items = containerRef.current?.querySelectorAll(
        '[data-masonry-item]'
      );
      if (!items) return;

      items.forEach((item) => {
        const images = item.querySelectorAll('img');

        images.forEach((img) => {
          const handleImageLoad = () => {
            imagesLoadingRef.current.loaded++;

            // Measure this item immediately when its image loads
            if (item instanceof HTMLElement) {
              const itemIndex = Number.parseInt(
                item.getAttribute('data-item-index') ?? '0',
                10
              );
              const rect = item.getBoundingClientRect();
              const height = rect.height || item.offsetHeight;

              if (height > 0) {
                itemHeightsRef.current.set(itemIndex, height);
                // Trigger immediate redistribution on image load
                forceUpdate((n) => n + 1);
              }
            }
          };

          if (img.complete && img.naturalHeight > 0) {
            handleImageLoad();
          } else {
            img.addEventListener('load', handleImageLoad, { once: true });
            img.addEventListener('error', handleImageLoad, { once: true });
          }
        });
      });
    });

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [strategy, isInitialized, children.length]);

  // Reset initialization when children or columns change significantly
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on structural changes
  useEffect(() => {
    if (strategy === 'balanced') {
      setIsInitialized(false);
      itemHeightsRef.current.clear();
    }
  }, [children.length, currentColumns, strategy]);

  // Distribute items across columns
  const distributeItems = () => {
    const columnWrappers: ReactNode[][] = Array.from(
      { length: currentColumns },
      () => []
    );

    if (
      strategy === 'balanced' &&
      isInitialized &&
      itemHeightsRef.current.size > 0
    ) {
      // Use measured heights for distribution with greedy algorithm
      const columnHeights = Array(currentColumns).fill(0);

      children.forEach((child, index) => {
        // Get item height with fallback to average if missing
        const itemHeight = itemHeightsRef.current.get(index);

        // If height not measured yet, use average of measured items or default
        let effectiveHeight = itemHeight;
        if (effectiveHeight === undefined || effectiveHeight <= 0) {
          const measuredHeights = Array.from(
            itemHeightsRef.current.values()
          ).filter((h) => h > 0);
          effectiveHeight =
            measuredHeights.length > 0
              ? measuredHeights.reduce((sum, h) => sum + h, 0) /
                measuredHeights.length
              : 200; // Reasonable default fallback
        }

        // Find the shortest column using greedy algorithm
        let shortestColumnIndex = 0;
        let minHeight = columnHeights[0] ?? 0;

        for (let i = 1; i < currentColumns; i++) {
          const height = columnHeights[i] ?? 0;
          // Use strict < to always pick the truly shortest column
          // This ensures deterministic behavior and better balance
          if (height < minHeight) {
            minHeight = height;
            shortestColumnIndex = i;
          }
        }

        // Add item to shortest column
        const column = columnWrappers[shortestColumnIndex];
        if (column) {
          column.push(child);
          // Update column height including gap
          columnHeights[shortestColumnIndex] += effectiveHeight + gap;
        }
      });
    } else {
      // Use item count for distribution (default, faster, or during measurement phase)
      const columnItemCounts = Array(currentColumns).fill(0);

      children.forEach((child) => {
        // Find the column with the fewest items using round-robin for ties
        let shortestColumnIndex = 0;
        let minCount = columnItemCounts[0] ?? 0;

        for (let i = 1; i < currentColumns; i++) {
          const count = columnItemCounts[i] ?? 0;
          // Use strict < to pick first column with fewer items
          if (count < minCount) {
            minCount = count;
            shortestColumnIndex = i;
          }
        }

        // Add item to column
        const column = columnWrappers[shortestColumnIndex];
        if (column) {
          column.push(child);
          columnItemCounts[shortestColumnIndex]++;
        }
      });
    }

    return columnWrappers;
  };

  const columnWrappers = distributeItems();

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
  };

  return (
    <div ref={containerRef} style={containerStyle} className={className}>
      {strategy === 'balanced' && !isInitialized ? (
        <div style={columnStyle}>
          {children.map((child, index) => (
            <div key={index} data-masonry-item data-item-index={index}>
              {child}
            </div>
          ))}
        </div>
      ) : (
        columnWrappers.map((column, columnIndex) => (
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
                >
                  {child}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
