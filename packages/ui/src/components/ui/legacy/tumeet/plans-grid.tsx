'use client';

import EditPlanDialog from './edit-plan-dialog';
import type { MeetTogetherPlanWithParticipants } from './page';
import UserTime from './user-time';
import { Separator } from '@tuturuuu/ui/separator';
import dayjs from 'dayjs';
import { Calendar, CalendarDays, Clock, Users } from 'lucide-react';
import Link from 'next/link';

// Plans grid component
export function PlansGrid({
  plans,
  locale,
  t,
}: {
  plans: MeetTogetherPlanWithParticipants[];
  locale: string;
  // biome-ignore lint/suspicious/noExplicitAny: <translations are not typed>
  t: any;
}) {
  const handleDialogClick = (e: React.MouseEvent<HTMLDivElement>) => {
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
    <div className="mt-8 grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan: MeetTogetherPlanWithParticipants) => (
        <Link
          target="_blank"
          href={`/meet-together/plans/${plan.id?.replace(/-/g, '')}`}
          key={plan.id}
          className="group relative rounded-xl border border-foreground/10 bg-accent p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-lg"
        >
          {/* Header with title and timezone */}
          <div className="mb-5 flex w-full items-center justify-between gap-3">
            <h3 className="line-clamp-2 flex-1 text-lg leading-tight font-semibold text-foreground transition-colors">
              {plan.name || t('untitled_plan')}
            </h3>
            {plan.start_time && (
              <div className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium whitespace-nowrap text-foreground/80">
                UTC
                {Intl.NumberFormat('en-US', {
                  signDisplay: 'always',
                }).format(
                  parseInt(plan.start_time?.split(/[+-]/)?.[1] ?? '0') *
                    (plan.start_time?.includes('-') ? -1 : 1)
                )}
              </div>
            )}
            <div onClick={handleDialogClick}>
              <EditPlanDialog plan={plan} />
            </div>
          </div>

          {/* Description */}
          {plan.description && (
            <p className="mb-5 line-clamp-2 text-sm leading-relaxed text-foreground/70">
              {plan.description}
            </p>
          )}

          {/* Time range */}
          {plan.start_time && plan.end_time && (
            <div className="mb-4 space-y-1">
              <div className="flex items-center gap-2 text-foreground/80">
                <Clock className="h-4 w-4 text-dynamic-green" />
                <span className="text-sm font-medium">
                  <UserTime time={plan.start_time} /> -{' '}
                  <UserTime time={plan.end_time} />
                </span>
              </div>
              <p className="ml-6 text-xs text-foreground/60">
                {t('local_time')}
              </p>
            </div>
          )}

          {/* Creation date */}
          {plan.created_at && (
            <div className="mb-4 flex items-center gap-2 text-xs text-foreground/60">
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
                  <span className="text-sm font-medium text-foreground">
                    {t('participants')}
                  </span>
                  <span className="rounded-full bg-dynamic-blue/10 px-2 py-0.5 text-xs font-medium text-dynamic-blue">
                    {plan.participants.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {plan.participants.slice(0, 3).map((participant) => (
                    <div
                      key={participant.user_id}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 ${
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
                      <span>{participant.display_name || t('anonymous')}</span>
                    </div>
                  ))}
                  {plan.participants.length > 3 && (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium text-foreground/70 transition-colors group-hover:bg-foreground/20">
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
                  <span className="text-sm font-medium text-foreground">
                    {t('dates_count', { count: plan.dates.length })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {plan.dates?.slice(0, 4).map((date) => (
                    <div
                      key={date}
                      className="flex items-center justify-center rounded-full bg-dynamic-purple/10 px-3 py-1 text-xs font-medium text-dynamic-purple transition-colors group-hover:bg-dynamic-purple/20"
                    >
                      {dayjs(date)
                        .locale(locale)
                        .format(`${locale === 'vi' ? 'DD/MM' : 'MMM D'}`)}
                    </div>
                  ))}
                  {plan.dates.length > 4 && (
                    <div className="flex items-center justify-center rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium transition-colors group-hover:bg-foreground/20">
                      +{plan.dates.length - 4}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </Link>
      ))}
    </div>
  );
}
