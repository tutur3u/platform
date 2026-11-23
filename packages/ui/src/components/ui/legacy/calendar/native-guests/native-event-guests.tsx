'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from '@tuturuuu/icons';
import {
  addCalendarEventGuests,
  type CalendarGuestSettings,
  getCalendarEventGuests,
  notifyCalendarEventGuests,
  removeCalendarEventGuest,
  updateCalendarEventGuest,
  updateCalendarGuestSettings,
} from '@tuturuuu/internal-api/calendar-guests';
import { useTranslations } from 'next-intl';
import { Button } from '../../../button';
import { Checkbox } from '../../../checkbox';
import { Label } from '../../../label';
import { notifySave } from '../../../save-notification';
import { EventLinks } from './event-links';
import { GuestAdder } from './guest-adder';
import { GuestRow } from './guest-row';

type SettingKey =
  | 'guestsCanModify'
  | 'guestsCanInviteOthers'
  | 'guestsCanSeeGuestList';
const SETTING_KEYS: Array<[SettingKey, string]> = [
  ['guestsCanModify', 'can_modify'],
  ['guestsCanInviteOthers', 'can_invite'],
  ['guestsCanSeeGuestList', 'can_see_list'],
];
const DEFAULT_SETTINGS: Pick<CalendarGuestSettings, SettingKey> = {
  guestsCanModify: false,
  guestsCanInviteOthers: true,
  guestsCanSeeGuestList: true,
};

export function nativeGuestsQueryKey(workspaceId: string, eventId: string) {
  return ['calendar-event-guests', workspaceId, eventId] as const;
}

/** Guests of a saved Tuturuuu event, with RSVP state and invitation email. */
export function NativeEventGuests({
  workspaceId,
  eventId,
  timeZone,
  allDay,
}: {
  workspaceId: string;
  eventId: string;
  timeZone?: string;
  allDay?: boolean;
}) {
  const t = useTranslations('calendar.native_guests');
  const queryClient = useQueryClient();
  const queryKey = nativeGuestsQueryKey(workspaceId, eventId);
  const query = useQuery({
    queryKey,
    queryFn: () => getCalendarEventGuests(workspaceId, eventId),
    staleTime: 15_000,
  });
  const display = { ...(timeZone ? { timeZone } : {}), allDay };
  const failed = () =>
    notifySave({
      title: t('error_title'),
      description: t('error'),
      variant: 'destructive',
    });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const mutationOptions = { onError: failed, onSettled: refresh };

  const add = useMutation({
    mutationFn: (
      input: Parameters<typeof addCalendarEventGuests>[2]['guests'][number]
    ) =>
      addCalendarEventGuests(workspaceId, eventId, {
        guests: [input],
        notify: true,
        display,
      }),
    ...mutationOptions,
  });
  const remove = useMutation({
    mutationFn: (guestId: string) =>
      removeCalendarEventGuest(workspaceId, eventId, guestId),
    ...mutationOptions,
  });
  const toggleOptional = useMutation({
    mutationFn: (input: { guestId: string; optional: boolean }) =>
      updateCalendarEventGuest(workspaceId, eventId, input.guestId, {
        optional: input.optional,
      }),
    ...mutationOptions,
  });
  const settings = useMutation({
    mutationFn: (patch: Partial<Record<SettingKey, boolean>>) =>
      updateCalendarGuestSettings(workspaceId, eventId, patch),
    ...mutationOptions,
  });
  const notify = useMutation({
    mutationFn: () =>
      notifyCalendarEventGuests(workspaceId, eventId, {
        kind: 'update',
        display,
      }),
    onSuccess: (result: { delivery: { queued: number } | null }) =>
      notifySave({
        title: t('sent_title'),
        description: t('sent', { count: result.delivery?.queued ?? 0 }),
      }),
    ...mutationOptions,
  });

  if (query.isPending)
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>;
  if (query.isError)
    return (
      <div className="flex items-center gap-2">
        <p role="status" className="text-destructive text-sm">
          {t('load_error')}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
        >
          {t('retry')}
        </Button>
      </div>
    );

  const { guests } = query.data;
  const current = query.data.settings ?? DEFAULT_SETTINGS;
  const busy =
    add.isPending ||
    remove.isPending ||
    toggleOptional.isPending ||
    settings.isPending;
  const invitedCount = guests.filter(
    (guest) => !guest.isOrganizer && guest.invited
  ).length;
  const counts = guests.reduce(
    (acc, guest) => ({
      ...acc,
      [guest.rsvpStatus]: (acc[guest.rsvpStatus] ?? 0) + 1,
    }),
    {} as Record<string, number>
  );

  return (
    <section className="space-y-2" aria-label={t('title')}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">{t('title')}</p>
        {guests.length > 1 && (
          <p className="text-muted-foreground text-xs">
            {t('summary', {
              accepted: counts.accepted ?? 0,
              pending: counts.pending ?? 0,
              declined: counts.declined ?? 0,
              tentative: counts.tentative ?? 0,
            })}
          </p>
        )}
      </div>
      {query.data.native && (
        <EventLinks
          workspaceId={workspaceId}
          eventId={eventId}
          links={query.data.links}
          queryKey={queryKey}
        />
      )}
      <GuestAdder
        workspaceId={workspaceId}
        disabled={busy || guests.length >= 100}
        excludedEmails={guests.map((guest) => guest.email)}
        onAdd={(guest) => add.mutate(guest.input)}
      />
      {guests.length > 0 && (
        <ul className="divide-y">
          {guests.map((guest) => (
            <GuestRow
              key={guest.id}
              label={guest.displayName || guest.email}
              email={guest.email}
              rsvpStatus={guest.rsvpStatus}
              isOrganizer={guest.isOrganizer}
              isOptional={guest.isOptional}
              disabled={busy}
              onToggleOptional={() =>
                toggleOptional.mutate({
                  guestId: guest.id,
                  optional: !guest.isOptional,
                })
              }
              onRemove={() => remove.mutate(guest.id)}
            />
          ))}
        </ul>
      )}
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-muted-foreground text-xs">
          {t('permissions')}
        </legend>
        {SETTING_KEYS.map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <Checkbox
              id={`guest-setting-${eventId}-${key}`}
              checked={current[key]}
              disabled={busy}
              onCheckedChange={(checked) =>
                settings.mutate({ [key]: checked === true })
              }
            />
            <Label
              htmlFor={`guest-setting-${eventId}-${key}`}
              className="font-normal text-sm"
            >
              {t(label)}
            </Label>
          </div>
        ))}
      </fieldset>
      {invitedCount > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={notify.isPending}
          onClick={() => notify.mutate()}
        >
          <Send className="mr-2 size-4" />
          {t('send_update')}
        </Button>
      )}
    </section>
  );
}
