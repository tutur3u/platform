'use client';

import { useCalendar } from '@/hooks/useCalendar';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import { ColorPicker } from '@tuturuuu/ui/color-picker';
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
import { useEffect, useState } from 'react';

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
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset form when modal opens/closes or active event changes
  useEffect(() => {
    if (activeEvent) {
      setEvent({
        ...activeEvent,
      });

      // Check if this is an all-day event (no time component)
      const start = new Date(activeEvent.start_at);
      const end = new Date(activeEvent.end_at);
      setIsAllDay(
        start.getHours() === 0 &&
          start.getMinutes() === 0 &&
          end.getHours() === 23 &&
          end.getMinutes() === 59
      );
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
    }
  }, [activeEvent, isModalOpen]);

  const handleSave = async () => {
    if (!event.title || !event.start_at || !event.end_at) return;

    setIsSaving(true);
    try {
      // Check if this is a new event or an existing one
      if (activeEvent?.id === 'new') {
        // Create a new event
        await addEvent(event as Omit<CalendarEvent, 'id'>);
      } else if (activeEvent?.id) {
        // Update existing event
        await updateEvent(activeEvent.id, event);
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
      await deleteEvent(activeEvent.id);
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
  };

  const handleEndDateChange = (date: Date | undefined) => {
    if (!date) return;
    setEvent((prev) => ({ ...prev, end_at: date.toISOString() }));
  };

  const handleAllDayChange = (checked: boolean) => {
    setIsAllDay(checked);

    if (checked) {
      // Set times to start of day and end of day
      const startDate = new Date(event.start_at || '');
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(event.end_at || '');
      endDate.setHours(23, 59, 59, 999);

      setEvent((prev) => ({
        ...prev,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
      }));
    }
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

          <div className="flex items-center gap-2">
            <Switch
              id="allDay"
              checked={isAllDay}
              onCheckedChange={handleAllDayChange}
            />
            <Label htmlFor="allDay">All day</Label>
          </div>

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
            <ColorPicker
              value={event.color || 'BLUE'}
              color={event.color || 'BLUE'}
              onChange={(color) =>
                setEvent({ ...event, color: color as SupportedColor })
              }
            />
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
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
