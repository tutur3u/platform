'use client';

import { Calendar, CalendarDays, Clock, Users } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { formatTimezoneOffset } from '@tuturuuu/utils/date-helper';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import EditPlanDialog from './edit-plan-dialog';
import type { MeetTogetherPlanWithParticipants } from './page';
import UserTime from './user-time';

type Plan = MeetTogetherPlanWithParticipants;

export function planHref(path: string, plan: Plan) {
  return `${path}/${plan.id?.replace(/-/g, '')}`;
}

/** The plan name as the card's only link; it stretches over the whole card. */
export function PlanTitleLink({
  plan,
  path,
  className,
}: {
  plan: Plan;
  path: string;
  className?: string;
}) {
  const t = useTranslations('meet-together');
  return (
    <Link
      className={cn(
        'font-medium text-base leading-snug underline-offset-4 outline-none after:absolute after:inset-0 hover:underline focus-visible:underline',
        className
      )}
      href={planHref(path, plan)}
      rel="noopener"
      target="_blank"
    >
      {plan.name || t('untitled_plan')}
    </Link>
  );
}

/** Time zone and, for the creator, the edit action above the stretched link. */
export function PlanCardActions({
  plan,
  userId,
}: {
  plan: Plan;
  userId?: string | null;
}) {
  return (
    <div className="relative z-10 flex shrink-0 items-center gap-2">
      {plan.start_time && (
        <Badge className="tabular-nums" variant="outline">
          {formatTimezoneOffset(plan.start_time)}
        </Badge>
      )}
      {userId && userId === plan.creator_id ? (
        <EditPlanDialog plan={plan} />
      ) : null}
    </div>
  );
}

/** Time range, creation date, participant and date counts on one muted line. */
export function PlanMeta({
  plan,
  locale,
  withCounts,
}: {
  plan: Plan;
  locale: string;
  withCounts: boolean;
}) {
  const t = useTranslations('meet-together');
  const participants = plan.participants?.length ?? 0;
  const dates = plan.dates?.length ?? 0;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
      {plan.start_time && plan.end_time && (
        <li className="flex items-center gap-1.5">
          <Clock aria-hidden className="size-4" />
          <span className="tabular-nums">
            <UserTime time={plan.start_time} /> –{' '}
            <UserTime time={plan.end_time} />
          </span>
        </li>
      )}
      {plan.created_at && (
        <li className="flex items-center gap-1.5">
          <Calendar aria-hidden className="size-4" />
          {t('created_at', {
            date: dayjs(plan.created_at)
              .locale(locale)
              .format(locale === 'vi' ? 'DD/MM/YYYY' : 'MMM D, YYYY'),
          })}
        </li>
      )}
      {withCounts && participants > 0 && (
        <li className="flex items-center gap-1.5">
          <Users aria-hidden className="size-4" />
          {t('participant_count', { count: participants })}
        </li>
      )}
      {withCounts && dates > 0 && (
        <li className="flex items-center gap-1.5">
          <CalendarDays aria-hidden className="size-4" />
          {t('dates_count', { count: dates })}
        </li>
      )}
    </ul>
  );
}

/** Up to three participant names, guests outlined, then the remainder. */
export function PlanParticipants({ plan }: { plan: Plan }) {
  const t = useTranslations('meet-together');
  const participants = plan.participants ?? [];
  if (participants.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {participants.slice(0, 3).map((participant, index) => (
        <li key={participant.user_id ?? `guest-${index}`}>
          <Badge variant={participant.is_guest ? 'outline' : 'secondary'}>
            {participant.display_name || t('anonymous')}
          </Badge>
        </li>
      ))}
      {participants.length > 3 && (
        <li>
          <Badge className="tabular-nums" variant="outline">
            +{participants.length - 3}
          </Badge>
        </li>
      )}
    </ul>
  );
}

/** The first four candidate dates, then the remainder. */
export function PlanDates({ plan, locale }: { plan: Plan; locale: string }) {
  const dates = plan.dates ?? [];
  if (dates.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {dates.slice(0, 4).map((date) => (
        <li key={date}>
          <Badge className="tabular-nums" variant="secondary">
            {dayjs(date)
              .locale(locale)
              .format(locale === 'vi' ? 'DD/MM' : 'MMM D')}
          </Badge>
        </li>
      ))}
      {dates.length > 4 && (
        <li>
          <Badge className="tabular-nums" variant="outline">
            +{dates.length - 4}
          </Badge>
        </li>
      )}
    </ul>
  );
}
