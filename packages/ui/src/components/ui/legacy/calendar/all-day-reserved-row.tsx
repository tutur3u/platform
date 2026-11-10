import { Calendar } from '@tuturuuu/icons';
import { useRef } from 'react';
import {
  ALL_DAY_BAR_MIN_HEIGHT_REM,
  stableAllDayBarHeight,
} from './all-day-event-layout';
import { MIN_COLUMN_WIDTH } from './config';

/** Bar height that never shrinks below the last settled height while rows are carried over. */
export function useStableAllDayBarHeight(
  barHeight: number,
  isPlaceholder: boolean
) {
  const settled = useRef(ALL_DAY_BAR_MIN_HEIGHT_REM);
  const height = stableAllDayBarHeight({
    barHeight,
    isPlaceholder,
    settledHeight: settled.current,
  });
  if (!isPlaceholder) settled.current = height;
  return height;
}

/** Empty all-day row, rendered so all-day events arriving later never push the grid. */
export function AllDayReservedRow({
  columns,
  heightRem,
}: {
  columns: number;
  heightRem: number;
}) {
  return (
    <div className="flex" aria-hidden="true">
      <div className="flex w-16 items-center justify-center border-b border-l bg-muted/30 p-2 font-medium">
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </div>
      <div
        className="flex-1 border-b"
        style={{
          minWidth: `${columns * MIN_COLUMN_WIDTH}px`,
          height: `${heightRem}rem`,
        }}
      />
    </div>
  );
}
