import dayjs from 'dayjs';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

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
 * Find calendar view elements using robust selectors
 * @returns Object with timeTrail and calendarView elements
 */
export const findCalendarElements = () => {
  const calendarView = document.getElementById('calendar-view');
  if (!calendarView) return { timeTrail: null, calendarView: null };
  
  // Use more robust selectors instead of relying on child order
  const timeTrail = calendarView.querySelector('[class*="w-16"]') || 
                   calendarView.querySelector('[data-testid="time-trail"]') ||
                   calendarView.querySelector('.time-trail');
  
  const calendarViewDiv = calendarView.querySelector('.flex-1') || 
                         calendarView.querySelector('[data-testid="calendar-grid"]') ||
                         calendarView.querySelector('.calendar-grid');
  
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