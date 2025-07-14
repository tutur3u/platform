import dayjs from 'dayjs';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { HOUR_HEIGHT } from './config';

// Shared constants
export const METADATA_MARKER = '__PRESERVED_METADATA__';
export const TIME_TRAIL_WIDTH = 64; // Width of the time trail column

interface PreservedMetadata {
  original_scheduling_note?: string;
  preserved_timed_start?: string;
  preserved_timed_end?: string;
  was_all_day?: boolean;
}

/**
 * Calculate the duration of an event in minutes, handling preserved metadata
 * @param event The calendar event
 * @returns Duration in minutes (minimum 15 minutes)
 */
export const calculateEventDuration = (event: CalendarEvent): number => {
  let durationMinutes = 60; // Default 1 hour
  const schedulingNote = event.scheduling_note || '';

  if (schedulingNote.includes(METADATA_MARKER)) {
    try {
      const [, preservedJson] = schedulingNote.split(METADATA_MARKER);
      const preservedData: PreservedMetadata = JSON.parse(preservedJson || '{}');
      
      // Use preserved duration if available
      if (preservedData.preserved_timed_start && preservedData.preserved_timed_end) {
        const preservedStart = dayjs(preservedData.preserved_timed_start);
        const preservedEnd = dayjs(preservedData.preserved_timed_end);
        durationMinutes = preservedEnd.diff(preservedStart, 'minute');
      }
    } catch (e) {
      // Fall back to default duration if parsing fails
      durationMinutes = 60;
    }
  } else {
    // No preserved data, calculate from original event if it was a timed event
    const originalStart = dayjs(event.start_at);
    const originalEnd = dayjs(event.end_at);
    const originalDuration = originalEnd.diff(originalStart, 'minute');
    
    // Use original duration if reasonable, otherwise default to 1 hour
    if (originalDuration > 0 && originalDuration < 1440) {
      durationMinutes = originalDuration;
    }
  }
  
  // Ensure minimum duration of 15 minutes
  return Math.max(durationMinutes, 15);
};

/**
 * Find calendar view elements using robust selectors with defensive programming
 * @returns Object with timeTrail and calendarView elements, or null if not found
 */
export const findCalendarElements = () => {
  const calendarView = document.getElementById('calendar-view');
  if (!calendarView) {
    console.warn('Calendar view container not found');
    return { timeTrail: null, calendarView: null };
  }
  
  // Use multiple fallback selectors for time trail with validation
  let timeTrail: Element | null = null;
  const timeTrailSelectors = [
    '[data-testid="time-trail"]',
    '.time-trail',
    '[class*="w-16"]',
    '[class*="time-trail"]'
  ];
  
  for (const selector of timeTrailSelectors) {
    try {
      timeTrail = calendarView.querySelector(selector);
      if (timeTrail) break;
    } catch (error) {
      console.warn(`Failed to query selector ${selector}:`, error);
      continue;
    }
  }
  
  // Use multiple fallback selectors for calendar grid with validation
  let calendarViewDiv: Element | null = null;
  const calendarGridSelectors = [
    '[data-testid="calendar-grid"]',
    '.calendar-grid',
    '.flex-1',
    '[class*="calendar-grid"]'
  ];
  
  for (const selector of calendarGridSelectors) {
    try {
      calendarViewDiv = calendarView.querySelector(selector);
      if (calendarViewDiv) break;
    } catch (error) {
      console.warn(`Failed to query calendar grid selector ${selector}:`, error);
      continue;
    }
  }
  
  // Additional validation - ensure elements have expected structure
  if (timeTrail && !timeTrail.getBoundingClientRect) {
    console.warn('Time trail element missing getBoundingClientRect method');
    timeTrail = null;
  }
  
  if (calendarViewDiv && !calendarViewDiv.getBoundingClientRect) {
    console.warn('Calendar view div missing getBoundingClientRect method');
    calendarViewDiv = null;
  }
  
  // Validate that we found meaningful elements
  if (timeTrail && calendarViewDiv) {
    try {
      const timeTrailRect = timeTrail.getBoundingClientRect();
      const calendarRect = calendarViewDiv.getBoundingClientRect();
      
      // Basic sanity checks for element dimensions
      if (timeTrailRect.width === 0 || timeTrailRect.height === 0) {
        console.warn('Time trail element has zero dimensions');
        timeTrail = null;
      }
      
      if (calendarRect.width === 0 || calendarRect.height === 0) {
        console.warn('Calendar grid element has zero dimensions');
        calendarViewDiv = null;
      }
    } catch (error) {
      console.warn('Failed to validate element dimensions:', error);
      // Keep elements but note the error
    }
  }
  
  return { timeTrail, calendarView: calendarViewDiv };
};

/**
 * Preserve timestamps when converting from timed to all-day event
 * @param event The calendar event
 * @returns Event with preserved timestamps in scheduling_note
 */
export const preserveTimestamps = (event: CalendarEvent): CalendarEvent => {
  // Store original timed timestamps in scheduling_note when converting to all-day
  const schedulingNote = event.scheduling_note || '';
  
  if (!schedulingNote.includes(METADATA_MARKER)) {
    const preservedData: PreservedMetadata = {
      original_scheduling_note: schedulingNote,
      preserved_timed_start: event.start_at,
      preserved_timed_end: event.end_at,
      was_all_day: false,
    };
    
    return {
      ...event,
      scheduling_note: `${schedulingNote}${METADATA_MARKER}${JSON.stringify(preservedData)}`,
    };
  }
  
  return event;
};

/**
 * Restore preserved timestamps when converting back to timed event
 * @param event The calendar event
 * @param targetDate Optional target date to adjust the restored timestamps
 * @param tz Optional timezone
 * @returns Event with restored timestamps
 */
export const restoreTimestamps = (event: CalendarEvent, targetDate?: Date, tz?: string): CalendarEvent => {
  // Restore preserved timestamps when converting back to timed
  const schedulingNote = event.scheduling_note || '';
  
  if (schedulingNote.includes(METADATA_MARKER)) {
    try {
      const [, preservedJson] = schedulingNote.split(METADATA_MARKER);
      const preservedData: PreservedMetadata = JSON.parse(preservedJson || '{}');
      
      let startAt = preservedData.preserved_timed_start;
      let endAt = preservedData.preserved_timed_end;
      
      // If we have preserved timestamps, use them
      if (startAt && endAt) {
        // If dragged to a different date, adjust the date while preserving time
        if (targetDate) {
          const originalStart = dayjs(startAt);
          const originalEnd = dayjs(endAt);
          
          // Use the target date but preserve the original time (with timezone support)
          const targetDayjs = tz === 'auto' || !tz 
            ? dayjs(targetDate)
            : dayjs(targetDate).tz(tz);
          
          startAt = targetDayjs
            .hour(originalStart.hour())
            .minute(originalStart.minute())
            .second(originalStart.second())
            .millisecond(originalStart.millisecond())
            .toISOString();
          
          // Calculate duration to preserve event length
          const duration = originalEnd.diff(originalStart, 'millisecond');
          endAt = dayjs(startAt).add(duration, 'millisecond').toISOString();
        }
        
        return {
          ...event,
          start_at: startAt,
          end_at: endAt,
          scheduling_note: preservedData.original_scheduling_note || '',
        };
      }
    } catch (error) {
      console.error('Failed to restore timestamps:', error);
    }
  }
  
  return event;
};

/**
 * Create an all-day event from a timed event
 * @param event The timed event to convert
 * @param targetDate The target date for the all-day event
 * @returns All-day event
 */
export const createAllDayEventFromTimed = (event: CalendarEvent, targetDate: Date): CalendarEvent => {
  // Convert timed event to all-day event
  const startOfDay = dayjs(targetDate).startOf('day');
  const endOfDay = startOfDay.add(1, 'day');
  
  // Check if we have preserved all-day timestamps to restore
  const schedulingNote = event.scheduling_note || '';
  if (schedulingNote.includes(METADATA_MARKER)) {
    try {
      const [, preservedJson] = schedulingNote.split(METADATA_MARKER);
      const preservedData: PreservedMetadata = JSON.parse(preservedJson || '{}');
      
      // If this was originally an all-day event, restore to all-day for the target date
      if (preservedData.was_all_day) {
        return {
          ...event,
          start_at: startOfDay.toISOString(),
          end_at: endOfDay.toISOString(),
          scheduling_note: preservedData.original_scheduling_note || '',
        };
      }
    } catch (error) {
      console.error('Failed to restore all-day timestamps:', error);
    }
  }
  
  // First preserve the timed timestamps
  const preservedEvent = preserveTimestamps(event);
  
  return {
    ...preservedEvent,
    start_at: startOfDay.toISOString(),
    end_at: endOfDay.toISOString(),
  };
};

/**
 * Parse preserved metadata from scheduling_note
 * @param schedulingNote The scheduling note to parse
 * @returns Parsed metadata or null if unavailable or invalid
 */
export const parsePreservedMetadata = (schedulingNote: string): PreservedMetadata | null => {
  if (!schedulingNote.includes(METADATA_MARKER)) {
    return null;
  }
  
  try {
    const [, preservedJson] = schedulingNote.split(METADATA_MARKER);
    const preservedData: PreservedMetadata = JSON.parse(preservedJson || '{}');
    return preservedData;
  } catch (error) {
    console.error('Failed to parse preserved metadata:', error);
    return null;
  }
}; 

/**
 * Create a timed event from an all-day event
 * @param event The all-day event to convert
 * @param targetDate The target date for the timed event
 * @param hour The hour for the timed event (default 9)
 * @param minute The minute for the timed event (default 0)
 * @param tz Optional timezone
 * @param forceTime If true, always use the provided time but preserve duration
 * @returns Timed event
 */
export const createTimedEventFromAllDay = (
  event: CalendarEvent,
  targetDate: Date,
  hour: number = 9,
  minute: number = 0,
  tz?: string,
  forceTime: boolean = false
): CalendarEvent => {
  if (!forceTime) {
    // First check if we have preserved timestamps to restore
    const restoredEvent = restoreTimestamps(event, targetDate, tz);
    // If timestamps were successfully restored, use them
    if (restoredEvent.start_at !== event.start_at || restoredEvent.end_at !== event.end_at) {
      return restoredEvent;
    }
  } else {
    // Even when forceTime is true, we should try to preserve the original duration
    // but apply it to the target time
    const schedulingNote = event.scheduling_note || '';
    if (schedulingNote.includes(METADATA_MARKER)) {
      try {
        const [, preservedJson] = schedulingNote.split(METADATA_MARKER);
        const preservedData: PreservedMetadata = JSON.parse(preservedJson || '{}');
        
        // If we have preserved timestamps, use the duration but apply to target time
        if (preservedData.preserved_timed_start && preservedData.preserved_timed_end) {
          const originalStart = dayjs(preservedData.preserved_timed_start);
          const originalEnd = dayjs(preservedData.preserved_timed_end);
          const preservedDuration = originalEnd.diff(originalStart, 'millisecond');
          
          // Create new start time at target date/time
          const startTime = tz === 'auto' || !tz
            ? dayjs(targetDate).hour(hour).minute(minute).second(0).millisecond(0)
            : dayjs(targetDate).tz(tz).hour(hour).minute(minute).second(0).millisecond(0);
          
          // Apply preserved duration to get end time
          const endTime = startTime.add(preservedDuration, 'millisecond');
          
          return {
            ...event,
            start_at: startTime.toISOString(),
            end_at: endTime.toISOString(),
            scheduling_note: preservedData.original_scheduling_note || '',
          };
        }
      } catch (error) {
        console.error('Failed to restore duration from preserved timestamps:', error);
      }
    }
  }
  
  // No preserved timestamps - this means it was originally an all-day event
  // Use the drop location time with default 1-hour duration
  // Handle timezone properly using the same logic as the component
  const startTime = tz === 'auto' || !tz
    ? dayjs(targetDate).hour(hour).minute(minute).second(0).millisecond(0)
    : dayjs(targetDate).tz(tz).hour(hour).minute(minute).second(0).millisecond(0);
  const endTime = startTime.add(1, 'hour'); // Default 1-hour duration
  // Check if this event already has metadata (was converted before)
  const schedulingNote = event.scheduling_note || '';
  if (schedulingNote.includes(METADATA_MARKER)) {
    // Event already has metadata, just update the timestamps
    return {
      ...event,
      start_at: startTime.toISOString(),
      end_at: endTime.toISOString(),
    };
  }
  // Fresh all-day event, preserve it as all-day in metadata
  const preservedData: PreservedMetadata = {
    original_scheduling_note: schedulingNote,
    preserved_timed_start: startTime.toISOString(),
    preserved_timed_end: endTime.toISOString(),
    was_all_day: true,
  };
  return {
    ...event,
    start_at: startTime.toISOString(),
    end_at: endTime.toISOString(),
    scheduling_note: `${schedulingNote}${METADATA_MARKER}${JSON.stringify(preservedData)}`,
  };
}; 

// Helper: Detect drop zone (all-day or timed)
export function detectDropZone(clientY: number, calendarView: HTMLElement | null, allDayContainer: HTMLElement | null): 'all-day' | 'timed' {
  if (!calendarView) return 'all-day';
  const calendarRect = calendarView.getBoundingClientRect();
  if (!allDayContainer) return 'all-day';
  const allDayRect = allDayContainer.getBoundingClientRect();
  if (clientY > allDayRect.bottom && clientY < calendarRect.bottom) {
    return 'timed';
  }
  return 'all-day';
}

// Helper: Calculate visible hour offset
export function calculateVisibleHourOffset(clientY: number, cellRect: DOMRect, cellHour: number): number {
  const mouseYFromCellTop = clientY - cellRect.top;
  const mouseHourOffset = mouseYFromCellTop / HOUR_HEIGHT;
  return cellHour + mouseHourOffset;
}

// Helper: Calculate target date index
export function calculateTargetDateIndex(clientX: number, timeTrailRect: DOMRect, calendarViewRect: DOMRect, visibleDatesLength: number): number {
  const relativeX = clientX - timeTrailRect.right;
  const columnWidth = calendarViewRect.width / visibleDatesLength;
  const dateIndex = Math.floor(relativeX / columnWidth);
  return Math.max(0, Math.min(dateIndex, visibleDatesLength - 1));
}

// Helper: Round to nearest quarter hour
export function roundToNearestQuarterHour(hourFloat: number): { hour: number; minute: number } {
  const hour = Math.floor(hourFloat);
  const minuteFloat = (hourFloat - hour) * 60;
  const roundedMinute = Math.round(minuteFloat / 15) * 15;
  const finalMinute = roundedMinute === 60 ? 0 : roundedMinute;
  const finalHour = roundedMinute === 60 ? hour + 1 : hour;
  const clampedHour = Math.max(0, Math.min(finalHour, 23));
  const clampedMinute = clampedHour === 23 && finalMinute > 45 ? 45 : finalMinute;
  return { hour: clampedHour, minute: clampedMinute };
} 

/**
 * Calculate the time slot target for a drag/drop event in the calendar grid.
 * @param clientX Mouse X position
 * @param clientY Mouse Y position
 * @param visibleDates Array of visible dates in the calendar grid
 * @returns { date: Date, hour: number, minute: number } or null if not in a valid slot
 */
export function calculateTimeSlotTarget(
  clientX: number,
  clientY: number,
  visibleDates: Date[]
): { date: Date; hour: number; minute: number } | null {
  // Get the calendar view container
  const calendarView = document.getElementById('calendar-view');
  if (!calendarView) return null;

  // Find the actual start of the timed calendar grid using robust selectors
  const { timeTrail, calendarView: calendarViewDiv } = findCalendarElements();
  if (!timeTrail || !calendarViewDiv) return null;

  // Find any visible calendar cell to understand the actual grid positioning
  const anyVisibleCell = calendarViewDiv.querySelector('.calendar-cell');
  if (!anyVisibleCell) return null;

  // Get its hour to understand what's currently visible
  const cellHour = parseInt(anyVisibleCell.getAttribute('data-hour') || '0');
  const cellRect = anyVisibleCell.getBoundingClientRect();
  const timeTrailRect = timeTrail.getBoundingClientRect();

  // Calculate based on actual visible cell position
  const actualHour = calculateVisibleHourOffset(clientY, cellRect, cellHour);
  const relativeY = actualHour * HOUR_HEIGHT;
  if (relativeY < 0) return null; // Above the timed calendar

  // Calculate target date from column position
  const calendarViewRect = calendarViewDiv.getBoundingClientRect();
  const clampedDateIndex = calculateTargetDateIndex(clientX, timeTrailRect, calendarViewRect, visibleDates.length);
  const targetDate = visibleDates[clampedDateIndex];
  if (!targetDate) return null;

  // Calculate target time with proper precision using the actual hour height
  const hourFloat = relativeY / HOUR_HEIGHT;
  const { hour: clampedHour, minute: clampedMinute } = roundToNearestQuarterHour(hourFloat);

  return {
    date: targetDate,
    hour: clampedHour,
    minute: clampedMinute,
  };
} 