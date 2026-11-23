'use client';

import { Check, Clock, HelpCircle, X } from '@tuturuuu/icons';
import type { CalendarGuestRsvpStatus } from '@tuturuuu/internal-api/calendar-guests';
import { useTranslations } from 'next-intl';
import { Badge } from '../../../badge';
import { Button } from '../../../button';

const RSVP_ICON = {
  accepted: Check,
  declined: X,
  tentative: HelpCircle,
  pending: Clock,
} as const;

export function RsvpBadge({ status }: { status: CalendarGuestRsvpStatus }) {
  const t = useTranslations('calendar.native_guests');
  const Icon = RSVP_ICON[status];
  return (
    <Badge
      variant={status === 'accepted' ? 'default' : 'outline'}
      className="gap-1"
    >
      <Icon className="size-3" aria-hidden />
      {t(`rsvp_${status}`)}
    </Badge>
  );
}

/** One guest: identity, role tags, RSVP state and row actions. */
export function GuestRow({
  label,
  email,
  rsvpStatus,
  isOrganizer,
  isOptional,
  disabled,
  onToggleOptional,
  onRemove,
}: {
  label: string;
  email: string | null;
  rsvpStatus?: CalendarGuestRsvpStatus;
  isOrganizer?: boolean;
  isOptional?: boolean;
  disabled?: boolean;
  onToggleOptional?: () => void;
  onRemove?: () => void;
}) {
  const t = useTranslations('calendar.native_guests');
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{label}</p>
        {email && email !== label && (
          <p className="truncate text-muted-foreground text-xs">{email}</p>
        )}
      </div>
      {isOrganizer && <Badge variant="secondary">{t('organizer')}</Badge>}
      {rsvpStatus && <RsvpBadge status={rsvpStatus} />}
      {!isOrganizer && onToggleOptional && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={isOptional}
          disabled={disabled}
          onClick={onToggleOptional}
        >
          {isOptional ? t('optional') : t('required')}
        </Button>
      )}
      {!isOrganizer && onRemove && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={disabled}
          aria-label={t('remove', { name: label })}
          onClick={onRemove}
        >
          <X className="size-4" />
        </Button>
      )}
    </li>
  );
}
