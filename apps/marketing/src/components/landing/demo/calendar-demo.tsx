'use client';

import { Calendar, Sparkles, Users } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { CalendarGridDemo } from './calendar-grid-demo';
import {
  type DemoAccent,
  DemoCta,
  DemoFrame,
  DemoHeading,
  DemoItem,
  DemoLabel,
  DemoPane,
  DemoPulse,
  DemoStat,
  demoAccents,
} from './demo-chrome';

export function CalendarDemo() {
  const t = useTranslations('landing.demo.calendar');
  const tabs = useTranslations('landing.demo.tabs');

  return (
    <DemoPane>
      <DemoItem>
        <DemoHeading
          accent="blue"
          kicker={t('subtitle')}
          title={t('title')}
          aside={
            <div className="flex items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/[0.06] px-2.5 py-1">
              <DemoPulse accent="blue" />
              <DemoLabel className="text-dynamic-blue">
                {t('eventCount')}
              </DemoLabel>
            </div>
          }
        />
      </DemoItem>

      <DemoItem>
        <DemoFrame
          accent="blue"
          icon={Calendar}
          label={tabs('calendar')}
          meta={
            <DemoLabel className="hidden sm:inline">
              {t('todaySchedule')}
            </DemoLabel>
          }
        >
          <div className="md:hidden">
            <AgendaList />
          </div>
          <div className="hidden md:block">
            <CalendarGridDemo />
          </div>
        </DemoFrame>
      </DemoItem>

      <DemoItem className="grid grid-cols-2 gap-3">
        <DemoStat
          accent="green"
          label={t('stats.focusTime.label')}
          value={t('stats.focusTime.value')}
        />
        <DemoStat
          accent="blue"
          label={t('stats.optimized.label')}
          value={t('stats.optimized.value')}
        />
      </DemoItem>

      <DemoItem>
        <div className="relative overflow-hidden rounded-xl border border-dynamic-blue/20 bg-dynamic-blue/[0.06] p-3.5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-blue/50 to-transparent"
          />
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-dynamic-blue/25 bg-dynamic-blue/10">
              <Sparkles className="h-3 w-3 text-dynamic-blue" />
            </span>
            <div className="min-w-0">
              <DemoLabel className="text-dynamic-blue">
                {t('smartSuggestion.title')}
              </DemoLabel>
              <p className="mt-2 text-[0.8rem] text-foreground/55 leading-relaxed">
                {t('smartSuggestion.description')}
              </p>
            </div>
          </div>
        </div>
      </DemoItem>

      <DemoItem>
        <DemoCta accent="blue">{t('cta')}</DemoCta>
      </DemoItem>
    </DemoPane>
  );
}

/** Compact agenda used below `md`, where the week grid cannot breathe. */
function AgendaList() {
  const t = useTranslations('landing.demo.calendar');

  const events: {
    id: string;
    time: string;
    period: string;
    title: string;
    meta: string;
    accent: DemoAccent;
  }[] = [
    {
      id: 'event1',
      time: t('event1.time'),
      period: t('event1.period'),
      title: t('event1.title'),
      meta: t('event1.meta'),
      accent: 'purple',
    },
    {
      id: 'event2',
      time: t('event2.time'),
      period: t('event2.period'),
      title: t('event2.title'),
      meta: t('event2.meta'),
      accent: 'green',
    },
    {
      id: 'event3',
      time: t('event3.time'),
      period: t('event3.period'),
      title: t('event3.title'),
      meta: t('event3.meta'),
      accent: 'orange',
    },
  ];

  return (
    <div className="divide-y divide-foreground/[0.06]">
      {events.map((event) => {
        const styles = demoAccents[event.accent];

        return (
          <div className="flex gap-3 p-3" key={event.id}>
            <div className="w-12 shrink-0 pt-0.5 text-right">
              <div
                className={cn(
                  'font-mono-ui text-[0.72rem] tabular-nums',
                  styles.text
                )}
              >
                {event.time}
              </div>
              <DemoLabel className="text-foreground/30">
                {event.period}
              </DemoLabel>
            </div>
            <div
              className={cn(
                'min-w-0 flex-1 rounded-r-md border-l-2 pl-3',
                styles.rail
              )}
            >
              <div className="font-medium text-[0.82rem] text-foreground/85">
                {event.title}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-foreground/40">
                <Users className="h-2.5 w-2.5" />
                <DemoLabel>{event.meta}</DemoLabel>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
