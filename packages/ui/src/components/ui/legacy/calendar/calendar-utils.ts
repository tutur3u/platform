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