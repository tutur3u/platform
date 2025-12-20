'use client';

import {
  Calendar,
  CalendarDays,
  CalendarRange,
  Clock,
  Users,
} from '@tuturuuu/icons';
import { formatTimezoneOffset } from '@tuturuuu/utils/date-helper';
import dayjs from 'dayjs';
import Link from 'next/link';
import EditPlanDialog from './edit-plan-dialog';
import type { MeetTogetherPlanWithParticipants } from './page';
import UserTime from './user-time';

// Plans list view component
export function PlansListView({
  plans,
  locale,
  t,
  user,
  path = '/meet-together/plans',
}: {
  plans: MeetTogetherPlanWithParticipants[];
  locale: string;
  t: any;
  user?: { id: string } | null;
  path?: string;
}) {
  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="mb-6 rounded-full bg-dynamic-blue/10 p-8 shadow-sm">
          <CalendarDays />
        </div>
        <h3 className="mb-3 font-semibold text-foreground text-xl">
          {t('no_plans_yet')}
        </h3>
        <p className="max-w-md text-center text-foreground/70 text-sm leading-relaxed">
          {t('no_plans_desc')}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 w-full max-w-6xl space-y-4">
      {plans.map((plan: MeetTogetherPlanWithParticipants) => (
        <div
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
                <h3 className="line-clamp-1 flex-1 font-semibold text-foreground text-lg leading-tight transition-colors">
                  {plan.name || t('untitled_plan')}
                </h3>
                {plan.start_time && (
                  <div className="whitespace-nowrap rounded-full bg-foreground/10 px-3 py-1 font-medium text-foreground/80 text-xs">
                    {formatTimezoneOffset(plan.start_time)}
                  </div>
                )}
              </div>
              <div>
                {user?.id === plan.creator_id ? (
                  <EditPlanDialog plan={plan} />
                ) : null}
              </div>
            </div>

            {/* Make the rest clickable */}
            <Link
              target="_blank"
              href={`${path}/${plan.id?.replace(/-/g, '')}`}
              className="block"
            >
              {/* Description */}
              {plan.description && (
                <p className="line-clamp-1 text-foreground/70 text-sm leading-relaxed">
                  {plan.description}
                </p>
              )}

              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-4 text-foreground/60 text-xs">
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
                          .format(
                            locale === 'vi' ? 'DD/MM/YYYY' : 'MMM D, YYYY'
                          ),
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
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
