'use client';

import { Calendar, CalendarDays, Clock, Users } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { formatTimezoneOffset } from '@tuturuuu/utils/date-helper';
import dayjs from 'dayjs';
import Link from 'next/link';
import EditPlanDialog from './edit-plan-dialog';
import type { MeetTogetherPlanWithParticipants } from './page';
import UserTime from './user-time';

// Plans grid component
export function PlansGrid({
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
    <div className="mt-8 grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan: MeetTogetherPlanWithParticipants) => (
        <div
          key={plan.id}
          className="group relative rounded-xl border border-foreground/10 bg-accent p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-lg"
        >
          {/* Header with title and timezone */}
          <div className="mb-5 flex w-full items-center justify-between gap-3">
            <h3 className="line-clamp-2 flex-1 font-semibold text-foreground text-lg leading-tight transition-colors">
              {plan.name || t('untitled_plan')}
            </h3>
            {plan.start_time && (
              <div className="whitespace-nowrap rounded-full bg-foreground/10 px-3 py-1 font-medium text-foreground/80 text-xs">
                {formatTimezoneOffset(plan.start_time)}
              </div>
            )}
            <div>
              {user?.id === plan.creator_id ? (
                <EditPlanDialog plan={plan} />
              ) : null}
            </div>
          </div>

          {/* Make the rest of the card clickable */}
          <Link
            target="_blank"
            href={`${path}/${plan.id?.replace(/-/g, '')}`}
            className="block"
            rel="noopener"
          >
            {/* Description */}
            {plan.description && (
              <p className="mb-5 line-clamp-2 text-foreground/70 text-sm leading-relaxed">
                {plan.description}
              </p>
            )}

            {/* Time range */}
            {plan.start_time && plan.end_time && (
              <div className="mb-4 space-y-1">
                <div className="flex items-center gap-2 text-foreground/80">
                  <Clock className="h-4 w-4 text-dynamic-green" />
                  <span className="font-medium text-sm">
                    <UserTime time={plan.start_time} /> -{' '}
                    <UserTime time={plan.end_time} />
                  </span>
                </div>
                <p className="ml-6 text-foreground/60 text-xs">
                  {t('local_time')}
                </p>
              </div>
            )}

            {/* Creation date */}
            {plan.created_at && (
              <div className="mb-4 flex items-center gap-2 text-foreground/60 text-xs">
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

            {/* Participants section */}
            {plan.participants && plan.participants.length > 0 && (
              <>
                <Separator className="my-4" />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-dynamic-orange" />
                    <span className="font-medium text-foreground text-sm">
                      {t('participants')}
                    </span>
                    <span className="rounded-full bg-dynamic-blue/10 px-2 py-0.5 font-medium text-dynamic-blue text-xs">
                      {plan.participants.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.participants.slice(0, 3).map((participant) => (
                      <div
                        key={participant.user_id}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium text-xs transition-all duration-200 ${
                          participant.is_guest
                            ? 'bg-dynamic-orange/10 text-dynamic-orange group-hover:bg-dynamic-orange/20'
                            : 'bg-dynamic-green/10 text-dynamic-green group-hover:bg-dynamic-green/20'
                        }`}
                      >
                        <div
                          className={`h-1.5 w-1.5 rounded-full ${
                            participant.is_guest
                              ? 'bg-dynamic-orange'
                              : 'bg-dynamic-green'
                          }`}
                        />
                        <span>
                          {participant.display_name || t('anonymous')}
                        </span>
                      </div>
                    ))}
                    {plan.participants.length > 3 && (
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1 font-medium text-foreground/70 text-xs transition-colors group-hover:bg-foreground/20">
                        +{plan.participants.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Dates section */}
            {plan.dates && plan.dates.length > 0 && (
              <>
                <Separator className="my-4" />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-dynamic-purple" />
                    <span className="font-medium text-foreground text-sm">
                      {t('dates_count', { count: plan.dates.length })}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.dates?.slice(0, 4).map((date) => (
                      <div
                        key={date}
                        className="flex items-center justify-center rounded-full bg-dynamic-purple/10 px-3 py-1 font-medium text-dynamic-purple text-xs transition-colors group-hover:bg-dynamic-purple/20"
                      >
                        {dayjs(date)
                          .locale(locale)
                          .format(`${locale === 'vi' ? 'DD/MM' : 'MMM D'}`)}
                      </div>
                    ))}
                    {plan.dates.length > 4 && (
                      <div className="flex items-center justify-center rounded-full bg-foreground/10 px-3 py-1 font-medium text-xs transition-colors group-hover:bg-foreground/20">
                        +{plan.dates.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </Link>
        </div>
      ))}
    </div>
  );
}
