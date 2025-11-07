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
  const [measurementPhase, setMeasurementPhase] = useState(
    strategy === 'balanced'
  );

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

      // Reset measurement phase on column change
      if (strategy === 'balanced' && cols !== currentColumns) {
        setMeasurementPhase(true);
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

  // Measure individual item heights in the measurement phase
  useEffect(() => {
    if (!measurementPhase || strategy !== 'balanced') return;

    // Wait for next frame to ensure DOM is ready
    requestAnimationFrame(() => {
      itemHeightsRef.current.clear();

      const items = containerRef.current?.querySelectorAll(
        '[data-masonry-item]'
      );
      items?.forEach((item, index) => {
        if (item instanceof HTMLElement) {
          itemHeightsRef.current.set(index, item.offsetHeight);
        }
      });

      // End measurement phase
      setMeasurementPhase(false);
    });
  }, [measurementPhase, strategy, children.length]);

  // Distribute items across columns
  const distributeItems = () => {
    const columnWrappers: ReactNode[][] = Array.from(
      { length: currentColumns },
      () => []
    );

    if (
      strategy === 'balanced' &&
      !measurementPhase &&
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

  // In measurement phase, render items in a single column to measure heights
  if (measurementPhase && strategy === 'balanced') {
    return (
      <div
        ref={containerRef}
        style={{ ...containerStyle, opacity: 0, pointerEvents: 'none' }}
        className={className}
      >
        <div style={columnStyle}>
          {children.map((child, index) => (
            <div key={index} data-masonry-item>
              {child}
            </div>
          ))}
        </div>
      </div>
    );
  }

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

            return <div key={globalIndex}>{child}</div>;
          })}
        </div>
      ))}
    </div>
  );
}
