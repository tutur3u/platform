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

    const measureHeights = () => {
      const items = containerRef.current?.querySelectorAll(
        '[data-masonry-item]'
      );

      if (!items) return;

      // Initialize tracking
      imagesLoadingRef.current = { total: 0, loaded: 0 };

      // Count total images
      items.forEach((item) => {
        const images = item.querySelectorAll('img');
        imagesLoadingRef.current.total += images.length;
      });

      // Measure initial heights (even if images not loaded yet)
      items.forEach((item) => {
        if (item instanceof HTMLElement) {
          const itemIndex = Number.parseInt(
            item.getAttribute('data-item-index') ?? '0',
            10
          );
          itemHeightsRef.current.set(itemIndex, item.offsetHeight);
        }
      });

      // Show immediately
      setIsInitialized(true);

      // If no images, we're done
      if (imagesLoadingRef.current.total === 0) {
        return;
      }

      // Set up periodic redistribution while images are loading
      intervalRef.current = setInterval(() => {
        // Measure all items with current heights
        items.forEach((item) => {
          if (item instanceof HTMLElement) {
            const itemIndex = Number.parseInt(
              item.getAttribute('data-item-index') ?? '0',
              10
            );
            itemHeightsRef.current.set(itemIndex, item.offsetHeight);
          }
        });

        // Trigger redistribution
        forceUpdate((n) => n + 1);

        // Stop interval once all images are loaded
        if (imagesLoadingRef.current.loaded >= imagesLoadingRef.current.total) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }, 100); // Recalculate every 100ms

      // Setup image load handlers
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
              itemHeightsRef.current.set(itemIndex, item.offsetHeight);
            }
          };

          if (img.complete) {
            handleImageLoad();
          } else {
            img.onload = handleImageLoad;
            img.onerror = handleImageLoad;
          }
        });
      });
    };

    // Wait for next frame to ensure DOM is ready
    requestAnimationFrame(() => {
      measureHeights();
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
      // Use measured heights for distribution
      const columnHeights = Array(currentColumns).fill(0);

      children.forEach((child, index) => {
        // Find the shortest column - properly handle equal heights by choosing later columns
        let shortestColumnIndex = 0;
        let minHeight = columnHeights[0] ?? 0;

        for (let i = 1; i < currentColumns; i++) {
          const height = columnHeights[i] ?? 0;
          // Use <= to rotate through columns when heights are equal
          if (height <= minHeight) {
            minHeight = height;
            shortestColumnIndex = i;
          }
        }

        const column = columnWrappers[shortestColumnIndex];
        if (column) {
          column.push(child);
          const itemHeight = itemHeightsRef.current.get(index) ?? 0;
          const currentHeight = columnHeights[shortestColumnIndex];
          if (currentHeight !== undefined) {
            columnHeights[shortestColumnIndex] =
              currentHeight + itemHeight + gap;
          }
        }
      });
    } else {
      // Use item count for distribution (default, faster, or during measurement phase)
      const columnItemCounts = Array(currentColumns).fill(0);

      children.forEach((child) => {
        // Find the column with the fewest items
        let shortestColumnIndex = 0;
        let minCount = columnItemCounts[0] ?? 0;

        for (let i = 1; i < currentColumns; i++) {
          const count = columnItemCounts[i] ?? 0;
          if (count <= minCount) {
            minCount = count;
            shortestColumnIndex = i;
          }
        }

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
