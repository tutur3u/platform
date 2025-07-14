import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useCalendar } from '../../../../hooks/use-calendar';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import dayjs from 'dayjs';
import { Clock, ArrowRight, Calendar } from 'lucide-react';
import { calculateEventDuration } from './calendar-utils';

// Utility function to adjust color opacity
const adjustColorOpacity = (colorClass: string, fromOpacity: string, toOpacity: string): string => {
  const opacityPattern = new RegExp(`/${fromOpacity}(?![0-9])`);
  return opacityPattern.test(colorClass) ? colorClass.replace(opacityPattern, `/${toOpacity}`) : colorClass;
};

// Helper function to get slot position description
const getSlotPositionDescription = (minute: number): string => {
  switch (minute) {
    case 0: return 'top';
    case 15: return '1st quarter';
    case 30: return 'middle';
    default: return '3rd quarter';
  }
};

// Preview dimensions and positioning constants
const PREVIEW_DIMENSIONS = {
  WIDTH: 320,
  HEIGHT: 180,
  MIN_WIDTH: 280,
  MAX_WIDTH: 350,
  SPACING: 8,
  VIEWPORT_PADDING: 10,
  MAX_DURATION_MINUTES_FOR_FULL_BAR: 120,
} as const;

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

interface DurationVisualizationProps {
  conversionInfo: {
    isAllDay: boolean;
    durationMinutes?: number;
    duration: string;
    start: Date;
    end: Date;
  };
  eventStyles: {
    bg: string;
  };
  shortTimeFormat: string;
}

interface TargetSlotIndicatorProps {
  conversionInfo: {
    isAllDay: boolean;
    start: Date;
  };
  targetTimeSlot?: {
    hour: number;
    minute: number;
  } | null;
  shortTimeFormat: string;
}

// Extracted DurationVisualization component
const DurationVisualization = ({ conversionInfo, eventStyles, shortTimeFormat }: DurationVisualizationProps) => {
  if (conversionInfo.isAllDay) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-black/5 dark:bg-white/5 rounded-md">
        <Calendar className="w-4 h-4 opacity-70" />
        <span className="text-sm font-medium">All day event</span>
      </div>
    );
  }

  const durationMinutes = conversionInfo.durationMinutes || 60;
  const progressWidth = Math.min((durationMinutes / PREVIEW_DIMENSIONS.MAX_DURATION_MINUTES_FOR_FULL_BAR) * 100, 100);

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
                adjustColorOpacity(eventStyles.bg, '60', '80')
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

// Extracted TargetSlotIndicator component
const TargetSlotIndicator = ({ conversionInfo, targetTimeSlot, shortTimeFormat }: TargetSlotIndicatorProps) => {
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
  const slotPosition = getSlotPositionDescription(targetMinute);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-100/60 dark:bg-blue-900/30 rounded-md border border-blue-200/50 dark:border-blue-800/50">
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
        Target: {targetTime} slot ({slotPosition})
      </span>
    </div>
  );
};

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
      
      // Calculate duration using shared utility function
      const durationMinutes = calculateEventDuration(draggedEvent);
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

  // Helper function to calculate available space around cursor
  const calculateAvailableSpace = (mousePos: { x: number; y: number }, previewSize: { width: number; height: number }, gridTop: number, calendarRect: DOMRect) => {
    return {
      right: window.innerWidth - mousePos.x - PREVIEW_DIMENSIONS.VIEWPORT_PADDING,
      left: mousePos.x - PREVIEW_DIMENSIONS.VIEWPORT_PADDING,
      above: mousePos.y - gridTop - PREVIEW_DIMENSIONS.VIEWPORT_PADDING,
      below: calendarRect.bottom - mousePos.y - PREVIEW_DIMENSIONS.VIEWPORT_PADDING,
    };
  };

  // Helper function to determine optimal position based on available space
  const determineOptimalPosition = (mousePos: { x: number; y: number }, previewSize: { width: number; height: number }, space: ReturnType<typeof calculateAvailableSpace>) => {
    const spacing = PREVIEW_DIMENSIONS.SPACING;
    
    // Determine horizontal position
    let left: number;
    if (space.right >= previewSize.width + spacing) {
      left = mousePos.x + spacing;
    } else if (space.left >= previewSize.width + spacing) {
      left = mousePos.x - previewSize.width - spacing;
    } else {
      left = space.right >= space.left 
        ? mousePos.x + spacing 
        : mousePos.x - previewSize.width - spacing;
    }
    
    // Determine vertical position
    let top: number;
    if (space.above >= previewSize.height + spacing) {
      top = mousePos.y - previewSize.height - spacing;
    } else if (space.below >= previewSize.height + spacing) {
      top = mousePos.y + spacing;
    } else {
      top = mousePos.y - previewSize.height / 2;
    }
    
    return { left, top };
  };

  // Grid-aligned positioning - align to calendar grid lines instead of cursor
  const getConstrainedPosition = () => {
    const calendarView = document.getElementById('calendar-view');
    if (!calendarView) {
      console.warn('Calendar view element not found, using fallback positioning');
      return {
        left: `${mouseX + PREVIEW_DIMENSIONS.VIEWPORT_PADDING}px`,
        top: `${mouseY - PREVIEW_DIMENSIONS.HEIGHT}px`,
        transform: 'rotate(-0.5deg)',
      };
    }
    
    const calendarRect = calendarView.getBoundingClientRect();
    const previewWidth = PREVIEW_DIMENSIONS.WIDTH;
    const previewHeight = PREVIEW_DIMENSIONS.HEIGHT;
    
    // Find the main calendar grid area (excluding headers)
    const dayHeaders = calendarView.querySelector('.grid.grid-cols-7');
    
    let gridTop = calendarRect.top;
    
    // Adjust for day headers if present
    if (dayHeaders) {
      const dayHeadersRect = dayHeaders.getBoundingClientRect();
      gridTop = dayHeadersRect.bottom;
    }
    
    // Calculate available space and optimal position
    const space = calculateAvailableSpace(
      { x: mouseX, y: mouseY },
      { width: previewWidth, height: previewHeight },
      gridTop,
      calendarRect
    );
    
    const { left, top } = determineOptimalPosition(
      { x: mouseX, y: mouseY },
      { width: previewWidth, height: previewHeight },
      space
    );
    
    // Ensure the preview stays within viewport bounds
    const constrainedLeft = Math.max(PREVIEW_DIMENSIONS.VIEWPORT_PADDING, Math.min(left, window.innerWidth - previewWidth - PREVIEW_DIMENSIONS.VIEWPORT_PADDING));
    const constrainedTop = Math.max(PREVIEW_DIMENSIONS.VIEWPORT_PADDING, Math.min(top, window.innerHeight - previewHeight - PREVIEW_DIMENSIONS.VIEWPORT_PADDING));
    
    return {
      left: `${constrainedLeft}px`,
      top: `${constrainedTop}px`,
      transform: 'rotate(-0.5deg)',
      zIndex: 9999,
    };
  };

  const previewStyle = {
    ...getConstrainedPosition(),
    minWidth: `${PREVIEW_DIMENSIONS.MIN_WIDTH}px`,
    maxWidth: `${PREVIEW_DIMENSIONS.MAX_WIDTH}px`,
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
        <TargetSlotIndicator 
          conversionInfo={conversionInfo}
          targetTimeSlot={targetTimeSlot}
          shortTimeFormat={shortTimeFormat}
        />

        {/* Duration visualization */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Event Duration
          </p>
          <DurationVisualization 
            conversionInfo={conversionInfo}
            eventStyles={eventStyles}
            shortTimeFormat={shortTimeFormat}
          />
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
      />
    </div>
  );
} 