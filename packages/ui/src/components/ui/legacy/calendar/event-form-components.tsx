'use client';

import { AlertCircle, Clock, MapPin, MessageSquare } from '@tuturuuu/icons';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import React, { type ReactNode } from 'react';
import { ColorPicker, colorMap } from './settings/color-picker';

// Color options aligned with SupportedColor type
export const COLOR_OPTIONS: {
  value: SupportedColor;
  name: string;
  className: string;
}[] = Object.entries(colorMap).map(([key, value]) => ({
  value: key as SupportedColor,
  name: value.name,
  className: value.cbg, // Use the cbg class from colorMap for proper visibility
}));

// Form section component for better organization
export const FormSection = ({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('space-y-3', className)}>
    <h3 className="font-medium text-muted-foreground text-sm">{title}</h3>
    <div className="space-y-4">{children}</div>
  </div>
);

// Event title input component
export const EventTitleInput = ({
  value,
  onChange,
  onEnter,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Label htmlFor="title" className="font-medium text-sm">
      Event Title
    </Label>
    <Input
      id="title"
      placeholder="Add title"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-none bg-muted/50 focus-visible:ring-0 focus-visible:ring-offset-0"
      disabled={disabled}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnter?.();
        }
      }}
      autoFocus
    />
  </div>
);

// Event description textarea component
export const EventDescriptionInput = ({
  value,
  onChange,
  disabled = false,
  mode = 'create', // 'create' | 'edit'
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  mode?: 'create' | 'edit';
}) => {
  const [height, setHeight] = React.useState(100);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const resizeHandleRef = React.useRef<HTMLDivElement>(null);
  const isDraggingRef = React.useRef(false);
  const startYRef = React.useRef(0);
  const startHeightRef = React.useRef(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const offsetYRef = React.useRef(0);

  // Calculate word count
  const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
  const charCount = value.length;
  const showToggle = wordCount >= 60 || charCount >= 400;

  // Set initial expanded state based on showToggle
  const [isExpanded, setIsExpanded] = React.useState(() => !showToggle);

  // Set default state for expanded/collapsed based on mode and word count
  // biome-ignore lint/correctness/useExhaustiveDependencies: <>
  React.useEffect(() => {
    if (showToggle) {
      setIsExpanded(false); // Always start clamped if > 60 words
    } else {
      setIsExpanded(true); // Always expanded if <= 60 words
    }
  }, [mode, value, showToggle]);

  // Handle show more/less toggle
  const handleToggleExpand = () => {
    setIsExpanded((prev) => !prev);
    setTimeout(() => {
      if (textareaRef.current) {
        // Scroll the button into view when toggling
        const button =
          textareaRef.current.parentElement?.parentElement?.querySelector(
            'button[data-show-toggle]'
          );
        if (button) {
          button.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }, 0);
  };

  // Throttle function
  // biome-ignore lint/complexity/noBannedTypes: <>
  const throttle = (func: Function, limit: number) => {
    let inThrottle: boolean;
    return function (this: any, ...args: any[]) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        // biome-ignore lint/suspicious/noAssignInExpressions: <>
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  };

  // Extracted auto-scroll logic with throttling
  const handleAutoScroll = React.useCallback(
    throttle((handleY: number) => {
      let scrollParent: HTMLElement | null =
        containerRef.current as unknown as HTMLElement | null;
      while (
        scrollParent &&
        scrollParent !== document.body &&
        scrollParent.scrollHeight <= scrollParent.clientHeight
      ) {
        scrollParent = scrollParent.parentElement;
      }
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const scrollMargin = 60; // Increased margin to start scrolling earlier
        const scrollSpeed = 20; // Increased scroll speed
        // Scroll down if handle is near bottom
        if (handleY > parentRect.bottom - scrollMargin) {
          scrollParent.scrollTop += scrollSpeed;
        }
        // Scroll up if handle is near top
        if (handleY < parentRect.top + scrollMargin) {
          scrollParent.scrollTop -= scrollSpeed;
        }
      }
    }, 16), // Reduced throttling interval to ~60fps for smoother scrolling
    []
  );

  // Reset height when value changes and not expanded
  React.useEffect(() => {
    if (!isExpanded) {
      setHeight(100);
    }
  }, [isExpanded]);

  // Handle resize
  const handleMouseDown = (e: MouseEvent | React.MouseEvent | TouchEvent) => {
    e.preventDefault();
    let clientY: number;
    if ('touches' in e && e.touches && e.touches.length > 0 && e.touches[0]) {
      clientY = e.touches[0].clientY;
    } else if ('clientY' in e) {
      clientY = (e as MouseEvent | React.MouseEvent).clientY;
    } else {
      return;
    }
    isDraggingRef.current = true;
    startYRef.current = clientY;
    startHeightRef.current = height;
    // Calculate offset between mouse and bottom of textarea
    if (textareaRef.current) {
      const rect = textareaRef.current.getBoundingClientRect();
      offsetYRef.current = rect.bottom - clientY;
    } else {
      offsetYRef.current = 0;
    }

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      let moveClientY: number;
      if (
        'touches' in moveEvent &&
        moveEvent.touches &&
        moveEvent.touches.length > 0 &&
        moveEvent.touches[0]
      ) {
        moveClientY = moveEvent.touches[0].clientY;
      } else if ('clientY' in moveEvent) {
        moveClientY = (moveEvent as MouseEvent).clientY;
      } else {
        return;
      }
      if (!isDraggingRef.current) return;
      // Calculate new height so the handle stays under the cursor
      if (textareaRef.current) {
        const rect = textareaRef.current.getBoundingClientRect();
        let newHeight = moveClientY + offsetYRef.current - rect.top;
        newHeight = Math.max(100, newHeight);
        setHeight(newHeight);
        // Call auto-scroll with handle Y position
        handleAutoScroll(rect.bottom);
      }
    };

    const handleUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMove as any);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove as any);
      document.removeEventListener('touchend', handleUp);
    };

    document.addEventListener('mousemove', handleMove as any);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove as any);
    document.addEventListener('touchend', handleUp);
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label className="flex items-center gap-2 font-medium text-sm">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        Description
      </Label>
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Add event details..."
          className={cn(
            'overflow-wrap-anywhere wrap-break-word resize-none whitespace-pre-wrap transition-all duration-200',
            isExpanded ? 'h-auto' : 'overflow-y-auto',
            'scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent'
          )}
          style={{
            height: isExpanded ? 'auto' : `${height}px`,
            maxHeight: isExpanded ? 'none' : `${height}px`,
          }}
          disabled={disabled}
        />
        {!isExpanded && showToggle && (
          <div
            ref={resizeHandleRef}
            onMouseDown={handleMouseDown}
            onTouchStart={(e) => {
              e.preventDefault();
              if (
                'touches' in e &&
                e.touches &&
                e.touches.length > 0 &&
                e.touches[0]
              ) {
                handleMouseDown(e as unknown as TouchEvent);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleToggleExpand();
              }
            }}
            className="absolute right-0 bottom-0 left-0 h-4 cursor-ns-resize rounded-b-md transition-colors hover:bg-border/50"
          />
        )}
      </div>
      <div className="mt-1 flex min-h-5 items-center justify-between">
        {wordCount > 0 && (
          <span className="text-muted-foreground text-xs">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
        )}
        {showToggle && (
          <button
            type="button"
            data-show-toggle
            onClick={handleToggleExpand}
            className="font-medium text-muted-foreground text-xs transition-colors hover:text-foreground"
            disabled={disabled}
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </div>
  );
};

// Event location input component
export const EventLocationInput = ({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) => {
  // function to open Google Maps with the entered address
  const openGoogleMaps = () => {
    if (value) {
      // encode the address to be used in the URL
      const encodedAddress = encodeURIComponent(value);
      // open Google Maps in a new tab
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
        '_blank'
      );
    }
  };

  return (
    <div className="space-y-2">
      <Label
        htmlFor="location"
        className="flex items-center gap-2 font-medium text-sm"
      >
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
        Location
      </Label>
      <div className="relative">
        <Input
          id="location"
          placeholder="Add location"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-none bg-muted/50 pr-10 focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={disabled}
        />
        {value && (
          <button
            type="button"
            onClick={openGoogleMaps}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title="Open in Google Maps"
          >
            <MapPin className="h-4 w-4" />
          </button>
        )}
      </div>
      {value && (
        <div className="flex items-center text-muted-foreground text-xs">
          <span>Click the map icon to view in Google Maps</span>
        </div>
      )}
    </div>
  );
};

// Date and time picker component
export const EventDateTimePicker = ({
  label,
  value,
  onChange,
  disabled = false,
  icon,
  showTimeSelect = true,
  minDate,
  minTime,
  scrollIntoViewOnOpen,
  pickerButtonRef,
}: {
  label: string;
  value: Date;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
  icon?: ReactNode;
  showTimeSelect?: boolean;
  minDate?: Date;
  minTime?: string;
  scrollIntoViewOnOpen?: boolean;
  pickerButtonRef?: React.RefObject<HTMLButtonElement | null>;
}) => {
  const { weekStartsOn, timezone, timeFormat } = useCalendarPreferences();

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 font-medium text-sm">
        {icon || <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
        {label}
      </Label>
      <div className={cn(disabled ? 'pointer-events-none opacity-50' : '')}>
        <DateTimePicker
          date={value}
          setDate={(date) => onChange(date)}
          showTimeSelect={showTimeSelect}
          minDate={minDate}
          minTime={minTime}
          scrollIntoViewOnOpen={scrollIntoViewOnOpen}
          pickerButtonRef={pickerButtonRef}
          preferences={{ weekStartsOn, timezone, timeFormat }}
        />
      </div>
    </div>
  );
};

// Color picker component
export const EventColorPicker = ({
  value,
  onChange,
  disabled = false,
}: {
  value: SupportedColor;
  onChange: (value: SupportedColor) => void;
  disabled?: boolean;
}) => {
  const colorInfo = colorMap[value];

  return (
    <div className="space-y-1">
      <Label className="font-medium text-sm">Color</Label>
      <div className={cn(disabled ? 'pointer-events-none opacity-50' : '')}>
        <div className="flex flex-col space-y-1">
          <ColorPicker
            value={value}
            onChange={onChange}
            size="md"
            showTooltips={true}
          />
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <div className={cn('h-3 w-3 rounded-full', colorInfo.cbg)} />
            <span>
              {COLOR_OPTIONS.find((c) => c.value === value)?.name || 'Blue'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Toggle switch component
export const EventToggleSwitch = ({
  id,
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) => (
  <div className="flex items-center justify-between space-x-2">
    <div className="space-y-0.5">
      <Label htmlFor={id} className="font-medium text-sm">
        {label}
      </Label>
      {description && (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}
    </div>
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
    />
  </div>
);

// Overlap warning component
export const OverlapWarning = ({
  overlappingEvents,
}: {
  overlappingEvents: any[];
}) => {
  if (overlappingEvents.length === 0) return null;

  return (
    <Alert className="mt-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Scheduling Conflict</AlertTitle>
      <AlertDescription className="text-sm">
        This event overlaps with {overlappingEvents.length} other{' '}
        {overlappingEvents.length === 1 ? 'event' : 'events'}.
        <ul className="mt-2 list-inside list-disc">
          {overlappingEvents.slice(0, 3).map((event, index) => (
            <li key={index} className="text-xs">
              {event.title} (
              {new Date(event.start_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              -{' '}
              {new Date(event.end_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              )
            </li>
          ))}
          {overlappingEvents.length > 3 && (
            <li className="text-xs">
              ...and {overlappingEvents.length - 3} more
            </li>
          )}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

// Date error component
export const DateError = ({ error }: { error: string | null }) => {
  if (!error) return null;

  return (
    <Alert variant="destructive" className="mt-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Invalid Date Range</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
};

// Action buttons component
export const EventActionButtons = ({
  isEditing,
  onSave,
  onDelete,
  onCancel,
  isSaving,
  isDeleting,
  showDelete = true,
}: {
  isEditing: boolean;
  onSave: () => void;
  onDelete?: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isDeleting: boolean;
  showDelete?: boolean;
}) => (
  <div className="flex justify-between">
    <div>
      {isEditing && showDelete && (
        <Button
          variant="destructive"
          onClick={onDelete}
          disabled={isSaving || isDeleting}
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
      )}
    </div>
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={onCancel}
        disabled={isSaving || isDeleting}
      >
        Cancel
      </Button>
      <Button onClick={onSave} disabled={isSaving || isDeleting}>
        {isSaving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
      </Button>
    </div>
  </div>
);
