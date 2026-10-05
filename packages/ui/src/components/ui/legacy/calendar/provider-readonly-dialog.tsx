'use client';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Dialog, DialogContent } from '@tuturuuu/ui/dialog';
import { useFormatter } from 'next-intl';
import { EventModalHeader } from './event-modal-header';

/** Unsupported provider rules never mount the ordinary editable event form. */
export function ProviderReadonlyDialog({
  event,
  open,
  onOpenChange,
}: {
  event: CalendarEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const format = useFormatter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <EventModalHeader event={event} isEditing />
        <div className="space-y-4 px-6 py-5">
          <p className="text-muted-foreground text-sm">
            <time dateTime={event.start_at}>
              {format.dateTime(new Date(event.start_at), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
            {' – '}
            <time dateTime={event.end_at}>
              {format.dateTime(new Date(event.end_at), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
          </p>
          {event.location && <p className="text-sm">{event.location}</p>}
          {event.description && (
            <p className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">
              {event.description}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
