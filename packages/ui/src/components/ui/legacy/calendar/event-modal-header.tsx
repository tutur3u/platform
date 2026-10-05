import { ExternalLink, Video } from '@tuturuuu/icons';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { isProviderRecurrenceReadonly } from '@tuturuuu/utils/calendar-provider-readonly';
import { useTranslations } from 'next-intl';
import { getCalendarMeetingUrl } from './calendar-meeting-link';
import {
  CalendarEventProviderIcon,
  getCalendarEventProviderDisplay,
} from './event-provider-display';

export function EventModalHeader({
  event,
  isEditing,
}: {
  event: Partial<CalendarEvent>;
  isEditing: boolean;
}) {
  const t = useTranslations('calendar.recurrence');
  const readonly = isProviderRecurrenceReadonly(event);
  const providerDisplay = getCalendarEventProviderDisplay(event);
  const meetingUrl = getCalendarMeetingUrl(event);

  return (
    <DialogHeader className="border-b px-6 pt-6 pb-4">
      <DialogTitle className="flex flex-wrap items-center gap-2 font-semibold text-xl">
        <span>
          {readonly ? event.title : isEditing ? 'Edit Event' : 'Create Event'}
        </span>
        {providerDisplay && (
          <span className="ml-3 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1 text-sm">
            <CalendarEventProviderIcon className="h-4.5 w-4.5" event={event} />
            <span className="font-medium text-xs">{providerDisplay.label}</span>
          </span>
        )}
        {readonly && (
          <span className="rounded-md border bg-muted px-2 py-1 text-xs">
            {t('provider_readonly')}
          </span>
        )}
        {meetingUrl && (
          <Button asChild className="ml-auto" size="sm" variant="outline">
            <a href={meetingUrl} rel="noreferrer" target="_blank">
              <Video className="size-4" />
              Tuturuuu Meet
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        )}
      </DialogTitle>
      <DialogDescription>
        {readonly
          ? t('provider_readonly_description')
          : isEditing
            ? 'Make changes to your existing event'
            : 'Add a new event to your calendar'}
      </DialogDescription>
    </DialogHeader>
  );
}
