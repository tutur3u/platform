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
}: MasonryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentColumns, setCurrentColumns] = useState(columns);

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

  // Distribute items across columns using shortest column algorithm
  const columnWrappers: ReactNode[][] = Array.from(
    { length: currentColumns },
    () => []
  );

  // Track how many items each column has (as a proxy for height)
  const columnItemCounts = Array(currentColumns).fill(0);

  children.forEach((child) => {
    // Find the column with the fewest items
    let shortestColumnIndex = 0;
    let minCount = columnItemCounts[0];

    for (let i = 1; i < currentColumns; i++) {
      if (columnItemCounts[i] < minCount) {
        minCount = columnItemCounts[i];
        shortestColumnIndex = i;
      }
    }

    const column = columnWrappers[shortestColumnIndex];
    if (column) {
      column.push(child);
      columnItemCounts[shortestColumnIndex]++;
    }
  });

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
          {column}
        </div>
      ))}
    </div>
  );
}
