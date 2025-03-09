'use client';

import { useCalendar } from '../../../../hooks/use-calendar';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

// Extended CalendarEvent type to include multi-day event properties
interface ExtendedCalendarEvent extends CalendarEvent {
  _originalId?: string;
  _isMultiDay?: boolean;
  _dayPosition?: 'start' | 'middle' | 'end';
}

// Color options aligned with SupportedColor type
const COLOR_OPTIONS: {
  value: SupportedColor;
  name: string;
  className: string;
}[] = [
  { value: 'BLUE', name: 'Blue', className: 'bg-dynamic-light-blue/70' },
  { value: 'RED', name: 'Red', className: 'bg-dynamic-light-red/70' },
  { value: 'GREEN', name: 'Green', className: 'bg-dynamic-light-green/70' },
  { value: 'YELLOW', name: 'Yellow', className: 'bg-dynamic-light-yellow/70' },
  { value: 'ORANGE', name: 'Orange', className: 'bg-dynamic-light-orange/70' },
  { value: 'PURPLE', name: 'Purple', className: 'bg-dynamic-light-purple/70' },
  { value: 'PINK', name: 'Pink', className: 'bg-dynamic-light-pink/70' },
  { value: 'INDIGO', name: 'Indigo', className: 'bg-dynamic-light-indigo/70' },
  { value: 'CYAN', name: 'Cyan', className: 'bg-dynamic-light-cyan/70' },
  { value: 'GRAY', name: 'Gray', className: 'bg-dynamic-light-gray/70' },
];

export function EventModal() {
  const {
    activeEvent,
    isModalOpen,
    closeModal,
    addEvent,
    updateEvent,
    deleteEvent,
  } = useCalendar();

  const [event, setEvent] = useState<Partial<CalendarEvent>>({
    title: '',
    description: '',
    start_at: new Date().toISOString(),
    end_at: new Date(new Date().getTime() + 60 * 60 * 1000).toISOString(), // Default to 1 hour
    color: 'BLUE',
  });

  const [isAllDay, setIsAllDay] = useState(false);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  // Reset form when modal opens/closes or active event changes
  useEffect(() => {
    if (activeEvent) {
      // Handle IDs for split multi-day events (they contain a dash and date)
      const originalId = activeEvent.id.includes('-')
        ? activeEvent.id.split('-')[0]
        : activeEvent.id;

      // If this is a split event, we need to get the original event data
      const extendedEvent = activeEvent as ExtendedCalendarEvent;
      const eventData = extendedEvent._originalId
        ? { ...extendedEvent, id: originalId }
        : extendedEvent;

      setEvent({
        ...eventData,
      });

      // Check if this is an all-day event (no time component)
      const start = new Date(eventData.start_at);
      const end = new Date(eventData.end_at);

      const isAllDayEvent =
        start.getHours() === 0 &&
        start.getMinutes() === 0 &&
        end.getHours() === 23 &&
        end.getMinutes() === 59;

      setIsAllDay(isAllDayEvent);

      // Check if this is a multi-day event
      const startDay = new Date(start);
      startDay.setHours(0, 0, 0, 0);

      const endDay = new Date(end);
      endDay.setHours(0, 0, 0, 0);

      setIsMultiDay(startDay.getTime() !== endDay.getTime());
    } else {
      // Set default values for new event
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      setEvent({
        title: '',
        description: '',
        start_at: now.toISOString(),
        end_at: oneHourLater.toISOString(),
        color: 'BLUE',
      });
      setIsAllDay(false);
      setIsMultiDay(false);
    }

    // Clear any error messages
    setDateError(null);
  }, [activeEvent, isModalOpen]);

  const handleSave = async () => {
    if (!event.title || !event.start_at || !event.end_at) return;

    // Validate dates
    const startDate = new Date(event.start_at);
    const endDate = new Date(event.end_at);

    if (endDate <= startDate) {
      setDateError('End date must be after start date');
      return;
    }

    setDateError(null);
    setIsSaving(true);

    try {
      // Check if this is a new event or an existing one
      if (activeEvent?.id === 'new') {
        // Create a new event
        await addEvent(event as Omit<CalendarEvent, 'id'>);
      } else if (activeEvent?.id) {
        // For split events, use the original ID
        const originalId = activeEvent.id;

        // Make sure originalId is not undefined
        if (originalId) {
          // Update existing event
          await updateEvent(originalId, event);
        }
      }
      closeModal();
    } catch (error) {
      console.error('Error saving event:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeEvent?.id) return;

    setIsDeleting(true);
    try {
      // For split events, use the original ID
      const originalId = activeEvent.id;

      // Make sure originalId is not undefined
      if (originalId) {
        await deleteEvent(originalId);
      }
      closeModal();
    } catch (error) {
      console.error('Error deleting event:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartDateChange = (date: Date | undefined) => {
    if (!date) return;

    setEvent((prev) => {
      const newEvent = { ...prev, start_at: date.toISOString() };

      // If start time is after end time, push end time forward
      const endDate = new Date(prev.end_at || '');
      if (date > endDate) {
        const duration =
          endDate.getTime() - new Date(prev.start_at || '').getTime();
        const newEndDate = new Date(date.getTime() + duration);
        newEvent.end_at = newEndDate.toISOString();
      }

      return newEvent;
    });

    // Clear any error messages
    setDateError(null);
  };

  const handleEndDateChange = (date: Date | undefined) => {
    if (!date) return;

    const startDate = new Date(event.start_at || '');
    if (date <= startDate) {
      setDateError('End date must be after start date');
    } else {
      setDateError(null);
    }

    setEvent((prev) => ({ ...prev, end_at: date.toISOString() }));
  };

  const handleAllDayChange = (checked: boolean) => {
    setIsAllDay(checked);

    if (checked) {
      // Set times to start of day and end of day
      const startDate = new Date(event.start_at || '');
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(event.end_at || '');
      if (isMultiDay) {
        // For multi-day events, keep the end date but set to end of day
        endDate.setHours(23, 59, 59, 999);
      } else {
        // For single-day events, set end date to same day end
        endDate.setFullYear(
          startDate.getFullYear(),
          startDate.getMonth(),
          startDate.getDate()
        );
        endDate.setHours(23, 59, 59, 999);
      }

      setEvent((prev) => ({
        ...prev,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
      }));
    }
  };

  const handleMultiDayChange = (checked: boolean) => {
    setIsMultiDay(checked);

    if (checked) {
      // If enabling multi-day, set end date to next day
      const startDate = new Date(event.start_at || '');
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);

      if (isAllDay) {
        // For all-day events, set to end of day
        endDate.setHours(23, 59, 59, 999);
      } else {
        // For timed events, keep the same time
        endDate.setHours(startDate.getHours(), startDate.getMinutes());
      }

      setEvent((prev) => ({
        ...prev,
        end_at: endDate.toISOString(),
      }));
    } else {
      // If disabling multi-day, set end date to same day
      const startDate = new Date(event.start_at || '');
      const endDate = new Date(event.end_at || '');

      endDate.setFullYear(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate()
      );

      if (isAllDay) {
        // For all-day events, set to end of day
        endDate.setHours(23, 59, 59, 999);
      } else if (endDate <= startDate) {
        // Make sure end time is after start time
        endDate.setHours(startDate.getHours() + 1, startDate.getMinutes());
      }

      setEvent((prev) => ({
        ...prev,
        end_at: endDate.toISOString(),
      }));
    }

    // Clear any error messages
    setDateError(null);
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {activeEvent?.id && activeEvent.id !== 'new'
              ? 'Edit Event'
              : 'New Event'}
          </DialogTitle>
          <DialogDescription>
            {activeEvent?.id && activeEvent.id !== 'new'
              ? 'Make changes to your event here.'
              : 'Add a new event to your calendar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={event.title || ''}
              onChange={(e) => setEvent({ ...event, title: e.target.value })}
              placeholder="Event title"
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={event.description || ''}
              onChange={(e) =>
                setEvent({ ...event, description: e.target.value })
              }
              placeholder="Event description"
              rows={3}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <Switch
                id="allDay"
                checked={isAllDay}
                onCheckedChange={handleAllDayChange}
              />
              <Label htmlFor="allDay">All day</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="multiDay"
                checked={isMultiDay}
                onCheckedChange={handleMultiDayChange}
              />
              <Label htmlFor="multiDay">Multi-day</Label>
            </div>
          </div>

          {dateError && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{dateError}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="startDate">Start</Label>
            <DateTimePicker
              date={event.start_at ? new Date(event.start_at) : undefined}
              setDate={handleStartDateChange}
              showTimeSelect={!isAllDay}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="endDate">End</Label>
            <DateTimePicker
              date={event.end_at ? new Date(event.end_at) : undefined}
              setDate={handleEndDateChange}
              showTimeSelect={!isAllDay}
            />
          </div>

          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {COLOR_OPTIONS.map((colorOption) => (
                <button
                  key={colorOption.value}
                  type="button"
                  className={cn(
                    'h-8 w-full rounded-md border transition-all',
                    colorOption.className,
                    event.color === colorOption.value
                      ? 'border-3 border-primary/50'
                      : 'hover:border-3 hover:border-primary/20'
                  )}
                  title={colorOption.name}
                  aria-label={`Select ${colorOption.name} color`}
                  onClick={() =>
                    setEvent({ ...event, color: colorOption.value })
                  }
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div>
            {activeEvent?.id && activeEvent.id !== 'new' && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !!dateError}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
