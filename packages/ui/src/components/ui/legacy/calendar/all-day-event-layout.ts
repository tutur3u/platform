import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { allDayEventCivilDates } from '@tuturuuu/utils/calendar-utils';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { calendarDayKey } from '../../../../lib/calendar-day';
import { getEventLocationType } from './working-location';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
export const MAX_EVENTS_DISPLAY = 2;
function getZonedDay(date: Date, _zone?: string) {
  return dayjs(date).startOf('day');
}
export interface EventSpan {
  event: CalendarEvent;
  startIndex: number;
  endIndex: number;
  span: number;
  isCutOffStart: boolean; // Event starts before visible range
  isCutOffEnd: boolean; // Event ends after visible range
  actualStartDate: dayjs.Dayjs; // Actual start date of the event
  actualEndDate: dayjs.Dayjs; // Actual end date of the event
  row: number; // Add row property for proper stacking
  isMerged?: boolean;
  mergedEventIds?: string[];
}

export interface EventLayout {
  spans: EventSpan[];
  maxVisibleEventsPerDay: number;
  eventsByDay: EventSpan[][];
  locationSpansFromMerge: EventSpan[];
}

export function calculateAllDayEventLayout(
  allDayEvents: CalendarEvent[],
  visibleDates: Date[],
  tz: string | undefined,
  expandedDates: string[]
): EventLayout {
  const spans: EventSpan[] = [];
  const eventsByDay: EventSpan[][] = Array(visibleDates.length)
    .fill(null)
    .map(() => []);

  // First pass: create event spans without row assignment
  const tempSpans: Omit<EventSpan, 'row'>[] = [];

  // Process each all-day event
  (visibleDates.length ? allDayEvents : []).forEach((event) => {
    const civilDates = allDayEventCivilDates(event, tz);
    if (!civilDates) return;
    const eventStart = dayjs(civilDates.start);
    const eventEnd = dayjs(civilDates.end);

    // Find the start and end indices within our visible dates
    let startIndex = -1;
    let endIndex = -1;

    // First pass: find any overlap with visible dates
    const firstVisibleDate = getZonedDay(visibleDates[0]!, tz);
    const lastVisibleDate = getZonedDay(
      visibleDates[visibleDates.length - 1]!,
      tz
    );

    // Check if event overlaps with our visible date range at all
    // Event overlaps if: event_start < visible_end AND event_end > visible_start
    const eventOverlaps =
      eventStart.isBefore(lastVisibleDate.add(1, 'day'), 'day') &&
      eventEnd.isAfter(firstVisibleDate, 'day');

    if (!eventOverlaps) {
      return; // Skip this event if it doesn't overlap with visible dates
    }

    // Improved logic for multi-day events
    // Start index: first visible date that overlaps with the event
    if (eventStart.isSameOrBefore(firstVisibleDate, 'day')) {
      // Event starts before or on the first visible date
      startIndex = 0;
    } else {
      // Find the first visible date that matches the event start
      for (let i = 0; i < visibleDates.length; i++) {
        const currentDate = getZonedDay(visibleDates[i]!, tz);
        if (
          currentDate.isSameOrAfter(eventStart, 'day') &&
          currentDate.isBefore(eventEnd, 'day')
        ) {
          startIndex = i;
          break;
        }
      }
    }

    // End index: last visible date that overlaps with the event
    if (eventEnd.isAfter(lastVisibleDate.add(1, 'day'), 'day')) {
      // Event ends after the last visible date
      endIndex = visibleDates.length - 1;
    } else {
      // Find the last visible date that the event covers
      for (let i = visibleDates.length - 1; i >= 0; i--) {
        const currentDate = getZonedDay(visibleDates[i]!, tz);
        if (
          currentDate.isBefore(eventEnd, 'day') &&
          currentDate.isSameOrAfter(eventStart, 'day')
        ) {
          endIndex = i;
          break;
        }
      }
    }

    // Include events that have at least one day visible in our date range
    if (startIndex !== -1 && endIndex !== -1) {
      const span = endIndex - startIndex + 1;

      // Fix: Proper cut-off logic for all-day events
      // For all-day events, end_at is typically start of next day (exclusive)
      // So we need to check actual duration, not just date comparison
      const actualDurationDays = eventEnd.diff(eventStart, 'day');
      const isActuallyMultiDay = actualDurationDays > 1;

      // Only show cut-off indicators for events that actually span multiple days
      // AND are cut off by the visible range
      const isCutOffStart =
        isActuallyMultiDay && eventStart.isBefore(firstVisibleDate, 'day');
      const isCutOffEnd =
        isActuallyMultiDay &&
        eventEnd.isAfter(lastVisibleDate.add(1, 'day'), 'day');

      const eventSpan: Omit<EventSpan, 'row'> = {
        event,
        startIndex,
        endIndex,
        span,
        // Add indicators for cut-off events
        isCutOffStart,
        isCutOffEnd,
        actualStartDate: eventStart,
        actualEndDate: eventEnd,
      };

      tempSpans.push(eventSpan);
    }
  });

  // Second pass: Merge consecutive SINGLE-DAY events with same title and color
  // Optimized O(n log n) approach: group by mergeKey, sort groups, linear scan per group
  const mergedTempSpans: Omit<EventSpan, 'row'>[] = [];

  // Group single-day spans by mergeKey; multi-day events go directly to output
  const groups = new Map<string, Omit<EventSpan, 'row'>[]>();

  for (const span of tempSpans) {
    if (span.span !== 1) {
      // Multi-day events - don't merge, just add directly
      mergedTempSpans.push(span);
      continue;
    }

    const mergeKey = `${(span.event.title ?? '').toLowerCase().trim()}|${span.event.color ?? 'BLUE'}`;
    const group = groups.get(mergeKey) ?? [];
    group.push(span);
    groups.set(mergeKey, group);
  }

  // Process each group with linear merge
  for (const [, group] of groups) {
    // Sort by startIndex (O(k log k) per group, where k is group size)
    group.sort((a, b) => a.startIndex - b.startIndex);

    let currentMerged: Omit<EventSpan, 'row'> | null = null;
    let mergedIds: string[] = [];

    for (const span of group) {
      if (!currentMerged) {
        // Start a new potential merge chain
        currentMerged = { ...span };
        mergedIds = [span.event.id];
      } else if (span.startIndex === currentMerged.endIndex + 1) {
        // Adjacent - extend the merge
        currentMerged.endIndex = span.endIndex;
        currentMerged.span =
          currentMerged.endIndex - currentMerged.startIndex + 1;
        currentMerged.isCutOffEnd =
          currentMerged.isCutOffEnd || span.isCutOffEnd;
        currentMerged.actualEndDate = currentMerged.actualEndDate.isAfter(
          span.actualEndDate
        )
          ? currentMerged.actualEndDate
          : span.actualEndDate;
        mergedIds.push(span.event.id);
      } else {
        // Gap - push current merged span and start a new one
        if (mergedIds.length > 1) {
          currentMerged.isMerged = true;
          currentMerged.mergedEventIds = mergedIds;
        }
        mergedTempSpans.push(currentMerged);
        currentMerged = { ...span };
        mergedIds = [span.event.id];
      }
    }

    // Push the final merged span from this group
    if (currentMerged) {
      if (mergedIds.length > 1) {
        currentMerged.isMerged = true;
        currentMerged.mergedEventIds = mergedIds;
      }
      mergedTempSpans.push(currentMerged);
    }
  }

  // Sort final output by startIndex for consistent ordering
  mergedTempSpans.sort((a, b) => a.startIndex - b.startIndex);

  // Third pass: assign rows (ONLY for non-location events)
  // Location events will be rendered separately as a compact timeline strip
  // Extract location spans before filtering them out for row assignment
  const locationSpansFromMerge = mergedTempSpans
    .filter((span) => getEventLocationType(span.event) !== null)
    .map((span) => ({ ...span, row: 0 })); // Give them row 0 as placeholder

  const nonLocationSpans = mergedTempSpans.filter(
    (span) => getEventLocationType(span.event) === null
  );

  // Sort: 1) by span length (longer events first for better packing), 2) by start date
  const sortedTempSpans = nonLocationSpans.sort((a, b) => {
    // Longer events first (they need to claim their full row first)
    const spanDiff = b.span - a.span;
    if (spanDiff !== 0) return spanDiff;

    // Then by start date
    return a.actualStartDate.diff(b.actualStartDate);
  });

  // Track occupied rows for each day
  const occupiedRows: boolean[][] = Array(visibleDates.length)
    .fill(null)
    .map(() => []);

  // Assign rows to events
  sortedTempSpans.forEach((tempSpan) => {
    // Find the first available row that works for all days this event spans
    let row = 0;
    let rowFound = false;

    while (!rowFound) {
      // Check if this row is available for all days the event spans
      let canUseRow = true;
      for (
        let dayIndex = tempSpan.startIndex;
        dayIndex <= tempSpan.endIndex;
        dayIndex++
      ) {
        if (occupiedRows[dayIndex]?.[row]) {
          canUseRow = false;
          break;
        }
      }

      if (canUseRow) {
        // Mark this row as occupied for all days the event spans
        for (
          let dayIndex = tempSpan.startIndex;
          dayIndex <= tempSpan.endIndex;
          dayIndex++
        ) {
          if (!occupiedRows[dayIndex]) {
            occupiedRows[dayIndex] = [];
          }
          occupiedRows[dayIndex]![row] = true;
        }
        rowFound = true;
      } else {
        row++;
      }
    }

    // Create the final event span with row assignment
    const eventSpan: EventSpan = {
      ...tempSpan,
      row,
    };

    spans.push(eventSpan);

    // Add this event to each day it spans
    for (let i = tempSpan.startIndex; i <= tempSpan.endIndex; i++) {
      eventsByDay[i]?.push(eventSpan);
    }
  });

  // Calculate max visible events per day for layout purposes
  let maxVisibleEventsPerDay = 0;
  eventsByDay.forEach((dayEvents, dayIndex) => {
    const dateKey = calendarDayKey(visibleDates[dayIndex]!);

    const shouldShowAll = dayEvents.length === MAX_EVENTS_DISPLAY + 1;
    const isExpanded = expandedDates.includes(dateKey) || shouldShowAll;
    const visibleCount = isExpanded
      ? dayEvents.length
      : Math.min(dayEvents.length, MAX_EVENTS_DISPLAY);

    maxVisibleEventsPerDay = Math.max(maxVisibleEventsPerDay, visibleCount);
  });

  return {
    spans,
    maxVisibleEventsPerDay,
    eventsByDay,
    locationSpansFromMerge,
  };
}
