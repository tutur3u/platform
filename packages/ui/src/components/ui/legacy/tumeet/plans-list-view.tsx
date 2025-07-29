'use client';

import { formatTimezoneOffset } from '../../../../utils/date-helper';
import EditPlanDialog from './edit-plan-dialog';
import type { MeetTogetherPlanWithParticipants } from './page';
import UserTime from './user-time';
import dayjs from 'dayjs';
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  Clock,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import type { MouseEvent } from 'react';

// Plans list view component
export function PlansListView({
  plans,
  locale,
  t,
}: {
  plans: MeetTogetherPlanWithParticipants[];
  locale: string;
  // biome-ignore lint/suspicious/noExplicitAny: <translations are not typed>
  t: any;
}) {
  const handleDialogClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="mb-6 rounded-full bg-dynamic-blue/10 p-8 shadow-sm">
          <CalendarDays />
        </div>
        <h3 className="mb-3 text-xl font-semibold text-foreground">
          {t('no_plans_yet')}
        </h3>
        <p className="max-w-md text-center text-sm leading-relaxed text-foreground/70">
          {t('no_plans_desc')}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 w-full max-w-6xl space-y-4">
      {plans.map((plan: MeetTogetherPlanWithParticipants) => (
        <Link
          target="_blank"
          href={`/meet-together/plans/${plan.id?.replace(/-/g, '')}`}
          key={plan.id}
          className="group flex items-center gap-6 rounded-xl border border-foreground/10 bg-accent p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg"
        >
          {/* Plan icon/avatar */}
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-dynamic-blue/10">
            <CalendarRange />
          </div>

          {/* Plan content */}
          <div className="flex-1 space-y-3">
            {/* Header with title and timezone */}
            <div className="flex w-full items-start justify-between gap-3">
              <div className="flex flex-row gap-2">
                <h3 className="line-clamp-1 flex-1 text-lg leading-tight font-semibold text-foreground transition-colors">
                  {plan.name || t('untitled_plan')}
                </h3>
                {plan.start_time && (
                  <div className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium whitespace-nowrap text-foreground/80">
                    {formatTimezoneOffset(plan.start_time)}
                  </div>
                )}
              </div>
              <div onClick={handleDialogClick}>
                <EditPlanDialog plan={plan} />
              </div>
            </div>

            {/* Description */}
            {plan.description && (
              <p className="line-clamp-1 text-sm leading-relaxed text-foreground/70">
                {plan.description}
              </p>
            )}

            {/* Metadata row */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-foreground/60">
              {/* Time range */}
              {plan.start_time && plan.end_time && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-dynamic-green" />
                  <span>
                    <UserTime time={plan.start_time} /> -{' '}
                    <UserTime time={plan.end_time} />
                  </span>
                </div>
              )}

              {/* Creation date */}
              {plan.created_at && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-dynamic-blue" />
                  <span>
                    {t('created_at', {
                      date: dayjs(plan.created_at)
                        .locale(locale)
                        .format(locale === 'vi' ? 'DD/MM/YYYY' : 'MMM D, YYYY'),
                    })}
                  </span>
                </div>
              )}

              {/* Participants count */}
              {plan.participants && plan.participants.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-dynamic-orange" />
                  <span>
                    {plan.participants.length} {t('participants')}
                  </span>
                </div>
              )}

              {/* Dates count */}
              {plan.dates && plan.dates.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-dynamic-purple" />
                  <span>
                    {plan.dates.length} {t('dates')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
