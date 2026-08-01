'use client';

import { BarChart3, CalendarDays, Percent, Users } from '@tuturuuu/icons';
import type {
  MeetTogetherPlan,
  PlanUser,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Progress } from '@tuturuuu/ui/progress';
import { useTranslations } from 'next-intl';
import { calculateMeetPlanInsights } from '../lib/meet-insights';

export function MeetInsightsPanel({
  plan,
  users,
  timeblocks,
}: {
  plan: MeetTogetherPlan;
  users: PlanUser[];
  timeblocks: Timeblock[];
}) {
  const t = useTranslations('meet-together-plan-details');
  const insights = calculateMeetPlanInsights({ plan, users, timeblocks });
  const metrics = [
    {
      icon: Users,
      label: t('responses'),
      value: `${insights.respondedCount}/${insights.participantCount}`,
      detail: t('percent_responded', {
        count: Math.round(insights.responsePercent),
      }),
    },
    {
      icon: Percent,
      label: t('peak_attendance'),
      value: `${Math.round(insights.peakAttendancePercent)}%`,
      detail: t('count_available', { count: insights.peakAttendance }),
    },
    {
      icon: BarChart3,
      label: t('average_match'),
      value: `${Math.round(insights.averageAvailabilityPercent)}%`,
      detail: t('across_eligible_windows'),
    },
    {
      icon: CalendarDays,
      label: t('candidate_dates'),
      value: String(plan.dates?.length ?? 0),
      detail: t('minute_meeting', { count: plan.duration_minutes ?? 60 }),
    },
  ];

  return (
    <section className="space-y-5" aria-label={t('meeting_insights')}>
      <div className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ icon: Icon, label, value, detail }) => (
          <article key={label} className="bg-background p-5">
            <div className="mb-5 flex items-center justify-between text-muted-foreground">
              <span className="font-medium text-xs">{label}</span>
              <Icon className="h-4 w-4" />
            </div>
            <p className="font-semibold text-2xl tabular-nums tracking-tight">
              {value}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
          </article>
        ))}
      </div>

      <div className="rounded-2xl border bg-background/70 p-5">
        <div className="mb-5">
          <h3 className="font-semibold">{t('best_overlap_by_day')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('best_overlap_by_day_description')}
          </p>
        </div>
        <div className="space-y-4">
          {insights.overlapByDate.map(({ date, peak }) => {
            const percent = insights.participantCount
              ? (peak / insights.participantCount) * 100
              : 0;
            return (
              <div
                key={date}
                className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3"
              >
                <span className="text-sm tabular-nums">{date}</span>
                <Progress value={percent} className="h-2" />
                <span className="text-right text-muted-foreground text-xs tabular-nums">
                  {peak}/{insights.participantCount}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <Accordion
        type="single"
        collapsible
        className="rounded-2xl border bg-background/70 px-5"
      >
        <AccordionItem value="hourly" className="border-0">
          <AccordionTrigger>{t('hourly_availability')}</AccordionTrigger>
          <AccordionContent>
            <p className="mb-4 text-muted-foreground text-sm">
              {t('hourly_availability_description')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {insights.availabilityByHour.map(({ hour, percent }) => (
                <div
                  key={hour}
                  className="grid grid-cols-[4rem_1fr_3rem] items-center gap-3"
                >
                  <span className="text-sm tabular-nums">
                    {String(hour).padStart(2, '0')}:00
                  </span>
                  <Progress value={percent} className="h-2" />
                  <span className="text-right text-muted-foreground text-xs tabular-nums">
                    {Math.round(percent)}%
                  </span>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
