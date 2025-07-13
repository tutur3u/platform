import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useCalendar } from '../../../../hooks/use-calendar';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import dayjs from 'dayjs';
import { Clock, ArrowRight, Calendar } from 'lucide-react';

interface CrossZoneDragPreviewProps {
  draggedEvent: CalendarEvent;
  mouseX: number;
  mouseY: number;
  targetZone: 'timed' | 'all-day';
  targetDate?: Date | null;
  targetTimeSlot?: {
    hour: number;
    minute: number;
  } | null;
}

export function CrossZoneDragPreview({
  draggedEvent,
  mouseX,
  mouseY,
  targetZone,
  targetDate,
  targetTimeSlot,
}: CrossZoneDragPreviewProps) {
  const { settings } = useCalendar();
  const tz = settings?.timezone?.timezone;

  // Get event color styles with dark mode support
  const eventStyles = getEventStyles(draggedEvent.color || 'BLUE');

  // Calculate target times and duration based on conversion type
  const getConversionInfo = () => {
    if (targetZone === 'all-day' && targetDate) {
      const targetDay = tz === 'auto' 
        ? dayjs(targetDate).startOf('day')
        : dayjs(targetDate).tz(tz).startOf('day');
      
      return {
        start: targetDay.toDate(),
        end: targetDay.add(1, 'day').toDate(),
        duration: 'All day',
        isAllDay: true,
        conversionType: 'all-day',
        targetTimeDisplay: format(targetDay.toDate(), 'EEEE, MMM d'),
      };
    } else if (targetZone === 'timed' && targetDate && targetTimeSlot) {
      const startTime = tz === 'auto'
        ? dayjs(targetDate).hour(targetTimeSlot.hour).minute(targetTimeSlot.minute).second(0).millisecond(0)
        : dayjs(targetDate).tz(tz).hour(targetTimeSlot.hour).minute(targetTimeSlot.minute).second(0).millisecond(0);
      
      // Check if event has preserved timestamps (was originally a timed event)
      const schedulingNote = draggedEvent.scheduling_note || '';
      const METADATA_MARKER = '__PRESERVED_METADATA__';
      let durationMinutes = 60; // Default 1 hour
      
      if (schedulingNote.includes(METADATA_MARKER)) {
        try {
          const [, preservedJson] = schedulingNote.split(METADATA_MARKER);
          const preservedData = JSON.parse(preservedJson || '{}');
          
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
        const originalStart = dayjs(draggedEvent.start_at);
        const originalEnd = dayjs(draggedEvent.end_at);
        const originalDuration = originalEnd.diff(originalStart, 'minute');
        
        // Use original duration if reasonable, otherwise default to 1 hour
        if (originalDuration > 0 && originalDuration < 1440) {
          durationMinutes = originalDuration;
        }
      }
      
      // Ensure minimum duration of 15 minutes
      durationMinutes = Math.max(durationMinutes, 15);
      const endTime = startTime.add(durationMinutes, 'minute');
      
      return {
        start: startTime.toDate(),
        end: endTime.toDate(),
        duration: durationMinutes < 60 
          ? `${durationMinutes}m` 
          : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}m` : ''}`,
        isAllDay: false,
        conversionType: 'timed',
        targetTimeDisplay: format(startTime.toDate(), 'EEEE, MMM d'),
        durationMinutes,
      };
    }

    return null;
  };

  const conversionInfo = getConversionInfo();

  if (!conversionInfo) {
    return null;
  }

  const shortTimeFormat = settings?.appearance?.timeFormat === '24h' ? 'HH:mm' : 'h:mm a';

  // Grid-aligned positioning - align to calendar grid lines instead of cursor
  const getConstrainedPosition = () => {
    const calendarView = document.getElementById('calendar-view');
    if (!calendarView) {
      return {
        left: `${mouseX + 20}px`,
        top: `${mouseY - 120}px`,
        transform: 'rotate(-0.5deg)',
      };
    }
    
    const calendarRect = calendarView.getBoundingClientRect();
    const previewWidth = 320; // Estimated width of preview
    const previewHeight = 180; // Estimated height of preview
    
    // Find the main calendar grid area (excluding headers)
    const dayHeaders = calendarView.querySelector('.grid.grid-cols-7');
    const timeColumn = calendarView.querySelector('[class*="time-column"]') || calendarView.querySelector('[style*="grid-column: 1"]');
    
    let gridLeft = calendarRect.left;
    let gridRight = calendarRect.right;
    let gridTop = calendarRect.top;
    
    // Adjust for time column if present
    if (timeColumn) {
      const timeColumnRect = timeColumn.getBoundingClientRect();
      gridLeft = timeColumnRect.right;
    }
    
    // Adjust for day headers if present
    if (dayHeaders) {
      const dayHeadersRect = dayHeaders.getBoundingClientRect();
      gridTop = dayHeadersRect.bottom;
    }
    
    const spacing = 8; // Reduced spacing for closer positioning
    
    let left: number;
    let top: number;
    
    // Determine which side of cursor has more space
    const spaceRightOfCursor = window.innerWidth - mouseX - 20;
    const spaceLeftOfCursor = mouseX - 20;
    
    // Position based on cursor location and available space around it
    if (spaceRightOfCursor >= previewWidth + spacing) {
      // Position to the right of cursor
      left = mouseX + spacing;
    } else if (spaceLeftOfCursor >= previewWidth + spacing) {
      // Position to the left of cursor
      left = mouseX - previewWidth - spacing;
    } else {
      // Not enough space on either side of cursor, choose the side with more space
      if (spaceRightOfCursor >= spaceLeftOfCursor) {
        left = mouseX + spacing;
      } else {
        left = mouseX - previewWidth - spacing;
      }
    }
    
    // Position vertically: near cursor but avoid blocking the drop area
    const spaceAboveCursor = mouseY - gridTop - 20;
    const spaceBelowCursor = calendarRect.bottom - mouseY - 20;
    
    if (spaceAboveCursor >= previewHeight + spacing) {
      // Position above cursor
      top = mouseY - previewHeight - spacing;
    } else if (spaceBelowCursor >= previewHeight + spacing) {
      // Position below cursor
      top = mouseY + spacing;
    } else {
      // Not enough space above or below, position to the side at cursor level
      top = mouseY - previewHeight / 2;
    }
    
    // Ensure the preview stays within viewport bounds
    left = Math.max(10, Math.min(left, window.innerWidth - previewWidth - 10));
    top = Math.max(10, Math.min(top, window.innerHeight - previewHeight - 10));
    
    return {
      left: `${left}px`,
      top: `${top}px`,
      transform: 'rotate(-0.5deg)',
      zIndex: 9999,
    };
  };

  const previewStyle = {
    ...getConstrainedPosition(),
    minWidth: '280px',
    maxWidth: '350px',
  };

  // Duration visualization component
  const DurationVisualization = () => {
    if (conversionInfo.isAllDay) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-black/5 dark:bg-white/5 rounded-md">
          <Calendar className="w-4 h-4 opacity-70" />
          <span className="text-sm font-medium">All day event</span>
        </div>
      );
    }

    const durationMinutes = conversionInfo.durationMinutes || 60;
    const progressWidth = Math.min((durationMinutes / 120) * 100, 100); // Max 2 hours for full bar

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 opacity-70" />
          <span className="font-medium">Duration: {conversionInfo.duration}</span>
        </div>
        
        {/* Visual duration bar */}
        <div className="flex items-center gap-2 text-xs">
          <span className="opacity-70">
            {format(conversionInfo.start, shortTimeFormat)}
          </span>
          <div className="flex-1 relative">
            <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  eventStyles.bg.replace('bg-', 'bg-').replace('/60', '/80')
                )}
                style={{ width: `${progressWidth}%` }}
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <ArrowRight className="w-3 h-3 opacity-50" />
            </div>
          </div>
          <span className="opacity-70">
            {format(conversionInfo.end, shortTimeFormat)}
          </span>
        </div>
      </div>
    );
  };

  // Target slot indicator
  const TargetSlotIndicator = () => {
    if (conversionInfo.isAllDay) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-100/60 dark:bg-green-900/30 rounded-md border border-green-200/50 dark:border-green-800/50">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-green-700 dark:text-green-300">
            Target: All-day section
          </span>
        </div>
      );
    }

    const targetTime = format(conversionInfo.start, shortTimeFormat);
    const targetMinute = targetTimeSlot?.minute || 0;
    const slotPosition = targetMinute === 0 ? 'top' : targetMinute === 15 ? '1st quarter' : targetMinute === 30 ? 'middle' : '3rd quarter';

    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-100/60 dark:bg-blue-900/30 rounded-md border border-blue-200/50 dark:border-blue-800/50">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
          Target: {targetTime} slot ({slotPosition})
        </span>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'fixed pointer-events-none z-[9999] rounded-lg shadow-2xl border-2 transition-none backdrop-blur-sm',
        'bg-white/95 dark:bg-gray-900/95 border-gray-200/50 dark:border-gray-700/50'
      )}
      style={previewStyle}
    >
      {/* Header with event info */}
      <div className="px-4 py-3 border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="flex items-center gap-2 mb-2">
          <div 
            className={cn(
              "w-3 h-3 rounded-sm border",
              eventStyles.bg,
              eventStyles.border
            )}
          />
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate" 
              title={draggedEvent.title}>
            {draggedEvent.title || 'Untitled Event'}
          </h3>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span>Converting to</span>
          <span className={cn(
            "px-2 py-1 rounded-full text-xs font-medium",
            conversionInfo.isAllDay 
              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          )}>
            {conversionInfo.isAllDay ? 'All-day' : 'Timed'} event
          </span>
        </div>
      </div>

      {/* Target info */}
      <div className="px-4 py-3 space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Target Date
          </p>
          <p className="text-sm text-gray-900 dark:text-gray-100">
            {conversionInfo.targetTimeDisplay}
          </p>
        </div>

        {/* Target slot indicator */}
        <TargetSlotIndicator />

        {/* Duration visualization */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Event Duration
          </p>
          <DurationVisualization />
        </div>
      </div>

      {/* Conversion tip */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg border-t border-gray-200/50 dark:border-gray-700/50">
        <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
          {conversionInfo.isAllDay 
            ? 'Release to convert to all-day event' 
            : 'Release to place at target time slot'}
        </p>
      </div>

      {/* Pointer arrow */}
      <div 
        className="absolute -bottom-1 left-6 w-3 h-3 rotate-45 bg-white dark:bg-gray-900 border-r border-b border-gray-200/50 dark:border-gray-700/50"
        style={{ transform: 'rotate(45deg)' }}
      />
    </div>
  );
} 