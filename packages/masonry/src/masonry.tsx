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
  const [columnHeights, setColumnHeights] = useState<number[]>([]);
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map());

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
    };

    // Only run resize logic if breakpoints are provided
    if (Object.keys(breakpoints).length > 0) {
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    } else {
      setCurrentColumns(columns);
    }
  }, [columns, breakpoints]);

  // Measure column heights when using balanced strategy
  useEffect(() => {
    if (strategy !== 'balanced' || !containerRef.current) return;

    const measureHeights = () => {
      const heights: number[] = Array(currentColumns).fill(0);
      const columnElements = containerRef.current?.children;

      if (columnElements) {
        for (let i = 0; i < Math.min(currentColumns, columnElements.length); i++) {
          const column = columnElements[i];
          if (column instanceof HTMLElement) {
            heights[i] = column.scrollHeight;
          }
        }
      }

      setColumnHeights(heights);
    };

    // Initial measurement
    measureHeights();

    // Remeasure on resize
    const resizeObserver = new ResizeObserver(measureHeights);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [strategy, currentColumns]);

  // Distribute items across columns
  const distributeItems = () => {
    const columnWrappers: ReactNode[][] = Array.from(
      { length: currentColumns },
      () => []
    );

    if (strategy === 'balanced' && columnHeights.length === currentColumns) {
      // Use actual measured heights for distribution
      const tempHeights = [...columnHeights];

      children.forEach((child, index) => {
        // Find the shortest column by actual height
        let shortestColumnIndex = 0;
        let minHeight = tempHeights[0] ?? 0;

        for (let i = 1; i < currentColumns; i++) {
          const height = tempHeights[i] ?? 0;
          if (height <= minHeight) {
            minHeight = height;
            shortestColumnIndex = i;
          }
        }

        const column = columnWrappers[shortestColumnIndex];
        if (column) {
          column.push(child);
          // Estimate added height (we'll measure actual later)
          const ref = itemRefs.current.get(index);
          const itemHeight = ref ? ref.offsetHeight : 100;
          const currentHeight = tempHeights[shortestColumnIndex];
          if (currentHeight !== undefined) {
            tempHeights[shortestColumnIndex] = currentHeight + itemHeight + gap;
          }
        }
      });
    } else {
      // Use item count for distribution (default, faster)
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
      {columnWrappers.map((column, columnIndex) => (
        <div key={columnIndex} style={columnStyle}>
          {column.map((child, itemIndex) => {
            // Calculate global index for ref tracking
            const globalIndex = columnWrappers
              .slice(0, columnIndex)
              .reduce((acc, col) => acc + col.length, 0) + itemIndex;

            if (strategy === 'balanced') {
              return (
                <div
                  key={globalIndex}
                  ref={(el) => {
                    if (el) {
                      itemRefs.current.set(globalIndex, el);
                    } else {
                      itemRefs.current.delete(globalIndex);
                    }
                  }}
                >
                  {child}
                </div>
              );
            }

            return <div key={globalIndex}>{child}</div>;
          })}
        </div>
      ))}
    </div>
  );
}
