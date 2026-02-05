import dayjs from 'dayjs';
import type { CSSProperties } from 'react';
import type { SessionWithRelations } from '../../types';

/**
 * Maps category color names to vibrant bg classes for bar segments and legend dots.
 * Uses `dynamic-light-*` tokens — the same accent colors the smart calendar
 * uses for event card text, repurposed here as backgrounds for small elements.
 */
const ACCENT_BG_MAP: Record<string, string> = {
  BLUE: 'bg-dynamic-light-blue',
  RED: 'bg-dynamic-light-red',
  GREEN: 'bg-dynamic-light-green',
  YELLOW: 'bg-dynamic-light-yellow',
  PURPLE: 'bg-dynamic-light-purple',
  PINK: 'bg-dynamic-light-pink',
  ORANGE: 'bg-dynamic-light-orange',
  INDIGO: 'bg-dynamic-light-indigo',
  CYAN: 'bg-dynamic-light-cyan',
  GRAY: 'bg-dynamic-light-gray',
};

export function getAccentBgClass(color: string | null): string {
  const key = (color ?? 'GRAY').toUpperCase();
  return ACCENT_BG_MAP[key] ?? 'bg-dynamic-light-gray';
}

/**
 * Constants aligned with the smart calendar config
 * (packages/ui/src/components/ui/legacy/calendar/config.ts)
 */
export const HOUR_HEIGHT = 80; // px per hour row — matches smart calendar
export const MIN_BLOCK_HEIGHT = 16; // matches smart calendar MIN_EVENT_HEIGHT

export interface TimeBlock {
  id: string;
  sessionId: string;
  session: SessionWithRelations;
  dayIndex: number; // 0=Mon … 6=Sun (ISO week)
  startHours: number; // fractional hours from midnight (0–24)
  endHours: number;
  durationHours: number;
  categoryColor: string | null;
  categoryName: string | null;
  title: string;
  isRunning: boolean;
  column: number; // overlap column from graph coloring (0-based)
  totalColumns: number; // total columns in overlap group
}

/**
 * Convert sessions into TimeBlock[] for a given week.
 * Sessions spanning midnight are split into per-day blocks,
 * matching the smart calendar's multi-day event split pattern.
 */
export function buildTimeBlocks(
  sessions: SessionWithRelations[],
  weekStart: dayjs.Dayjs,
  userTimezone: string
): TimeBlock[] {
  const blocks: TimeBlock[] = [];

  for (const session of sessions) {
    const sessionStart = dayjs.utc(session.start_time).tz(userTimezone);
    const sessionEnd = session.end_time
      ? dayjs.utc(session.end_time).tz(userTimezone)
      : dayjs().tz(userTimezone);

    const isRunning = !session.end_time;

    for (let d = 0; d < 7; d++) {
      const dayStart = weekStart.add(d, 'day').startOf('day');
      const dayEnd = dayStart.endOf('day');

      if (sessionEnd.isBefore(dayStart) || sessionStart.isAfter(dayEnd)) {
        continue;
      }

      const effectiveStart = sessionStart.isBefore(dayStart)
        ? dayStart
        : sessionStart;
      const effectiveEnd = sessionEnd.isAfter(dayEnd) ? dayEnd : sessionEnd;

      const startHours = effectiveStart.hour() + effectiveStart.minute() / 60;
      const endHours =
        effectiveEnd.hour() +
        effectiveEnd.minute() / 60 +
        (effectiveEnd.second() > 0 ? 1 / 60 : 0);
      const minDuration = MIN_BLOCK_HEIGHT / HOUR_HEIGHT;
      const durationHours = Math.max(minDuration, endHours - startHours);

      blocks.push({
        id: `${session.id}-d${d}`,
        sessionId: session.id,
        session,
        dayIndex: d,
        startHours,
        endHours: Math.max(startHours + minDuration, endHours),
        durationHours,
        categoryColor: session.category?.color ?? null,
        categoryName: session.category?.name ?? null,
        title: session.title || '',
        isRunning: isRunning && effectiveEnd.isSame(sessionEnd),
        column: 0,
        totalColumns: 1,
      });
    }
  }

  return blocks;
}

/**
 * Graph-coloring overlap resolution, matching the smart calendar's
 * `assignLevels` algorithm from calendar-matrix.tsx.
 *
 * Groups overlapping blocks, then assigns columns via greedy coloring.
 */
export function resolveOverlaps(blocks: TimeBlock[]): TimeBlock[] {
  const byDay = new Map<number, TimeBlock[]>();
  for (const block of blocks) {
    const existing = byDay.get(block.dayIndex) ?? [];
    existing.push(block);
    byDay.set(block.dayIndex, existing);
  }

  for (const dayBlocks of byDay.values()) {
    dayBlocks.sort(
      (a, b) => a.startHours - b.startHours || b.durationHours - a.durationHours
    );

    const blocksOverlap = (a: TimeBlock, b: TimeBlock) =>
      a.startHours < b.endHours && a.endHours > b.startHours;

    // Group overlapping blocks (union-find style merge)
    const overlapGroups: TimeBlock[][] = [];

    for (const block of dayBlocks) {
      const overlappingGroupIndices: number[] = [];

      for (let i = 0; i < overlapGroups.length; i++) {
        if (overlapGroups[i]!.some((gb) => blocksOverlap(block, gb))) {
          overlappingGroupIndices.push(i);
        }
      }

      if (overlappingGroupIndices.length === 0) {
        overlapGroups.push([block]);
      } else {
        const merged = [block];
        overlappingGroupIndices.sort((a, b) => b - a);
        for (const idx of overlappingGroupIndices) {
          merged.push(...overlapGroups[idx]!);
          overlapGroups.splice(idx, 1);
        }
        overlapGroups.push(merged);
      }
    }

    // Greedy column assignment per group
    for (const group of overlapGroups) {
      group.sort(
        (a, b) =>
          a.startHours - b.startHours || b.durationHours - a.durationHours
      );

      const columnEndTimes: number[] = [];

      for (const block of group) {
        let col = -1;
        for (let i = 0; i < columnEndTimes.length; i++) {
          if (block.startHours >= columnEndTimes[i]!) {
            col = i;
            break;
          }
        }
        if (col === -1) {
          col = columnEndTimes.length;
        }
        block.column = col;
        columnEndTimes[col] = block.endHours;
      }

      const maxCol = columnEndTimes.length;
      for (const block of group) {
        block.totalColumns = maxCol;
      }
    }
  }

  return blocks;
}

/**
 * Determine visible hour range from blocks with 1h padding.
 * Falls back to 6am–10pm if no blocks.
 */
export function computeVisibleHourRange(blocks: TimeBlock[]): {
  startHour: number;
  endHour: number;
} {
  if (blocks.length === 0) {
    return { startHour: 6, endHour: 22 };
  }

  let minHour = 24;
  let maxHour = 0;
  for (const b of blocks) {
    if (b.startHours < minHour) minHour = b.startHours;
    if (b.endHours > maxHour) maxHour = b.endHours;
  }

  return {
    startHour: Math.max(0, Math.floor(minHour) - 1),
    endHour: Math.min(24, Math.ceil(maxHour) + 1),
  };
}

/**
 * Calculate CSS positioning for a single block within its day column.
 * Uses the same `startHours * HOUR_HEIGHT` approach as the smart calendar's event-card.tsx.
 */
export function calculateBlockStyle(
  block: TimeBlock,
  visibleStartHour: number
): CSSProperties {
  const topPx = (block.startHours - visibleStartHour) * HOUR_HEIGHT;
  const heightPx = Math.max(
    MIN_BLOCK_HEIGHT,
    block.durationHours * HOUR_HEIGHT
  );

  // Smart calendar layered overlap: col 0 = full width, col 1+ = indented
  const layerIndent = 16;
  const hasOverlaps = block.totalColumns > 1;

  let left: string;
  let width: string;

  if (hasOverlaps && block.column > 0) {
    const indent = layerIndent * block.column;
    left = `${indent}px`;
    width = `calc(100% - ${indent + 4}px)`;
  } else {
    left = '0';
    width = 'calc(100% - 4px)';
  }

  return {
    position: 'absolute',
    top: `${topPx}px`,
    height: `${heightPx - 2}px`,
    left,
    width,
    zIndex: hasOverlaps ? 10 + block.column : 10,
  };
}
