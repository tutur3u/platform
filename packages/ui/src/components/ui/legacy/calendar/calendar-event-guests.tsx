'use client';

import { CalendarAttendeeSnapshot } from './calendar-attendee-snapshot';

import { X } from '@tuturuuu/icons';
import type { CalendarSourceOption } from '@tuturuuu/internal-api';
import { useCalendarInvitationCapabilities } from '../../../../hooks/use-calendar-invitation-capabilities';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { WorkspacePeoplePicker } from '@tuturuuu/ui/custom/workspace-people-picker';
import { useTranslations } from 'next-intl';
import {
  canInviteCalendarGuests,
  type CalendarEventCreationDraft,
} from '../../../../hooks/calendar-event-create-payload';
import {
  EventDescriptionInput,
  EventLocationInput,
} from './event-form-components';
import { NativeEventGuests } from './native-guests/native-event-guests';
import { PendingNativeGuests } from './native-guests/pending-native-guests';

export function CalendarEventDetails({
  event,
  onChange,
  source,
  workspaceId,
  isEditing,
  timeZone,
}: {
  event: CalendarEventCreationDraft;
  onChange: (event: CalendarEventCreationDraft) => void;
  source?: CalendarSourceOption;
  workspaceId?: string;
  isEditing: boolean;
  timeZone?: string;
}) {
  return (
    <>
      <EventLocationInput
        value={event.location || ''}
        onChange={(location) => onChange({ ...event, location })}
      />
      <EventDescriptionInput
        value={event.description || ''}
        onChange={(description) => onChange({ ...event, description })}
      />
      <CalendarEventParticipants
        event={event}
        onChange={onChange}
        source={source}
        workspaceId={workspaceId}
        isEditing={isEditing}
        timeZone={timeZone}
      />
    </>
  );
}

/**
 * Guests for a new event, or the read-only attendee snapshot of an existing
 * provider event. Renders nothing when neither applies.
 */
export function CalendarEventParticipants({
  event,
  onChange,
  source,
  workspaceId,
  isEditing,
  timeZone,
}: {
  event: CalendarEventCreationDraft;
  onChange: (event: CalendarEventCreationDraft) => void;
  source?: CalendarSourceOption;
  workspaceId?: string;
  isEditing: boolean;
  timeZone?: string;
}) {
  return (
    <>
      {isEditing &&
        workspaceId &&
        event.id &&
        event.id !== 'new' &&
        source?.writable &&
        source.provider !== 'tuturuuu' &&
        !event.providerColor &&
        !event.seriesId && (
          <CalendarAttendeeSnapshot
            key={`${workspaceId}:${event.id}:${source.id}`}
            wsId={workspaceId}
            eventId={event.id}
            source={source}
          />
        )}
      {workspaceId &&
        source?.provider === 'tuturuuu' &&
        source.writable &&
        (isEditing && event.id && event.id !== 'new' ? (
          <NativeEventGuests
            key={`${workspaceId}:${event.id}`}
            workspaceId={workspaceId}
            eventId={event.id}
            timeZone={timeZone}
          />
        ) : !isEditing ? (
          <PendingNativeGuests workspaceId={workspaceId} />
        ) : null)}
      {!isEditing && workspaceId && source?.provider !== 'tuturuuu' && (
        <CalendarEventGuests
          event={event}
          onChange={onChange}
          source={source}
          workspaceId={workspaceId}
          timeZone={timeZone}
        />
      )}
    </>
  );
}

function CalendarEventGuests({
  event,
  onChange,
  source,
  workspaceId,
  timeZone,
}: {
  event: CalendarEventCreationDraft;
  onChange: (event: CalendarEventCreationDraft) => void;
  source?: CalendarSourceOption;
  workspaceId: string;
  timeZone?: string;
}) {
  const t = useTranslations('calendar.contact_guests');
  const { capabilities, refresh, isRefreshing } =
    useCalendarInvitationCapabilities(workspaceId, source);
  const guests = event.invitation?.guests ?? [];
  const available = canInviteCalendarGuests({
    source,
    capabilities,
    timeZone,
    providerColor: event.providerColor,
  });
  const refreshable =
    source?.writable &&
    (source.provider === 'google' || source.provider === 'microsoft') &&
    Boolean(source.accountEmail && timeZone) &&
    !event.providerColor;
  if (!available && !guests.length && !refreshable) return null;
  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">{t('title')}</p>
      {available ? (
        <WorkspacePeoplePicker
          workspaceId={workspaceId}
          emailRequired
          disabled={guests.length >= 100}
          excludedEmails={guests.map(({ email }) => email)}
          labels={{
            trigger: t('add'),
            search: t('search'),
            minimumQuery: t('minimum_query'),
            // loading-text-allowed: picker renders it sr-only beside a skeleton
            loading: t('loading'),
            empty: t('empty'),
            error: t('error'),
            retry: t('retry'),
            contact: t('contact'),
            member: t('member'),
          }}
          onSelect={(person) => {
            if (!person.email || !timeZone || guests.length >= 100) return;
            const email = person.email.trim().toLowerCase();
            if (guests.some((guest) => guest.email.toLowerCase() === email))
              return;
            onChange({
              ...event,
              invitation: {
                timeZone,
                guests: [
                  ...guests,
                  {
                    email,
                    ...(person.displayName ? { name: person.displayName } : {}),
                  },
                ],
              },
            });
          }}
        />
      ) : (
        <div className="flex items-center gap-2">
          <p role="status" className="text-destructive text-sm">
            {t('unavailable')}
          </p>
          {refreshable && (
            <Button
              type="button"
              variant="outline"
              disabled={isRefreshing}
              onClick={() => {
                void refresh();
              }}
            >
              {t('retry')}
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {guests.map((guest) => (
          <Badge key={guest.email} variant="secondary" className="gap-1">
            <span>
              {guest.name ? `${guest.name} <${guest.email}>` : guest.email}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-5"
              aria-label={t('remove', { email: guest.email })}
              onClick={() => {
                const remaining = guests.filter(
                  ({ email }) => email !== guest.email
                );
                onChange({
                  ...event,
                  invitation:
                    remaining.length && event.invitation
                      ? {
                          guests: remaining,
                          timeZone: event.invitation.timeZone,
                        }
                      : undefined,
                });
              }}
            >
              <X className="size-3" />
            </Button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
