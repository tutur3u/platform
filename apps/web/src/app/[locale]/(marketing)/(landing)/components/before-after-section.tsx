'use client';

import { gsap } from '@tuturuuu/ui/gsap';
import {
  AlarmCheck,
  Calendar,
  CalendarX,
  UserCheck,
  Workflow,
} from '@tuturuuu/ui/icons';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

export function BeforeAfterSection() {
  const locale = useLocale();
  const t = useTranslations('landing');

  const sectionRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<'split' | 'before' | 'after'>(
    'split'
  );

  // Initial scroll-triggered animations (run once)
  useEffect(() => {
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
      // Title animation
      gsap.from('.before-after-title-wrapper', {
        y: 50,
        opacity: 0,
        duration: 0.8,
        scrollTrigger: {
          trigger: '.before-after-title-wrapper',
          start: 'top bottom-=100',
          toggleActions: 'play none none none', // Play once
        },
      });

      // Tabs animation
      gsap.from('.comparison-tabs', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        delay: 0.2,
        scrollTrigger: {
          trigger: '.before-after-title-wrapper',
          start: 'top bottom-=100',
          toggleActions: 'play none none none', // Play once
        },
      });

      // Initial animations for before/after cards
      if (beforeRef.current && afterRef.current) {
        // Before card animation
        gsap.from(beforeRef.current, {
          x: -50,
          opacity: 0,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.comparison-container',
            start: 'top bottom-=50',
            toggleActions: 'play none none none', // Play once
          },
        });

        // After card animation
        gsap.from(afterRef.current, {
          x: 50,
          opacity: 0,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.comparison-container',
            start: 'top bottom-=50',
            toggleActions: 'play none none none', // Play once
          },
          delay: 0.3,
        });

        // Pain points and benefits staggered animation (initial only)
        gsap.from('.pain-point', {
          x: -20,
          opacity: 0,
          duration: 0.4,
          stagger: 0.1,
          scrollTrigger: {
            trigger: '.comparison-container',
            start: 'top bottom-=50',
            toggleActions: 'play none none none', // Play once
          },
        });

        gsap.from('.benefit-point', {
          x: -20,
          opacity: 0,
          duration: 0.4,
          stagger: 0.1,
          scrollTrigger: {
            trigger: '.comparison-container',
            start: 'top bottom-=50',
            toggleActions: 'play none none none', // Play once
          },
          delay: 0.5,
        });
      }
    }, sectionRef); // Scope context to section

    return () => {
      ctx.revert(); // Clean up
    };
  }, []); // Empty dependency array = run once on mount

  // Handle animations when activeView changes
  useEffect(() => {
    if (!sectionRef.current || !beforeRef.current || !afterRef.current) return;

    const ctx = gsap.context(() => {
      // Animate cards based on activeView
      if (activeView === 'before') {
        // Expand the before card, hide the after card
        gsap.to(beforeRef.current, {
          width: '100%',
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out',
        });
        gsap.to(afterRef.current, {
          width: '0%',
          opacity: 0,
          duration: 0.4,
          ease: 'power2.out',
        });
      } else if (activeView === 'after') {
        // Hide the before card, expand the after card
        gsap.to(beforeRef.current, {
          width: '0%',
          opacity: 0,
          duration: 0.4,
          ease: 'power2.out',
        });
        gsap.to(afterRef.current, {
          width: '100%',
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out',
        });
      } else {
        // split view
        // Restore both cards to equal size
        gsap.to(beforeRef.current, {
          width: '50%',
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out',
        });
        gsap.to(afterRef.current, {
          width: '50%',
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out',
        });
      }
    }, sectionRef);

    return () => {
      ctx.revert();
    };
  }, [activeView]); // Re-run when activeView changes

  return (
    <section
      ref={sectionRef}
      className="relative container hidden w-full px-0 py-24 md:block md:py-40"
    >
      <div className="before-after-title-wrapper mb-10 text-center">
        <h2 className="before-after-title mb-6 text-4xl font-bold md:text-5xl">
          <span className="bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-cyan bg-clip-text text-transparent">
            {t('before_and_after_tuturuuu')}
          </span>
        </h2>
        <p className="mx-auto max-w-3xl text-xl leading-relaxed text-balance text-muted-foreground">
          {t(
            'see_the_transformation_in_your_calendar_and_life_when_you_switch_to_ai_powered_scheduling'
          )}
        </p>
      </div>

      {/* Comparison Tabs */}
      <div className="comparison-tabs mb-10 flex justify-center">
        <div className="inline-flex rounded-full bg-white/90 p-1.5 shadow-md backdrop-blur-sm dark:bg-foreground/5">
          <button
            className={`relative rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
              activeView === 'split'
                ? 'bg-gradient-to-r from-dynamic-light-red to-dynamic-light-green text-white'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveView('split')}
          >
            {t('split_view')}
            {activeView === 'split' && (
              <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-r from-dynamic-light-red/80 to-dynamic-light-green/80 blur-sm"></div>
            )}
          </button>
          <button
            className={`relative rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
              activeView === 'before'
                ? 'bg-gradient-to-r from-dynamic-light-red to-dynamic-red text-white'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveView('before')}
          >
            {t('before')}
            {activeView === 'before' && (
              <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-r from-dynamic-light-red/80 to-dynamic-red/80 blur-sm"></div>
            )}
          </button>
          <button
            className={`relative rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
              activeView === 'after'
                ? 'bg-gradient-to-r from-dynamic-light-green to-dynamic-green text-white'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveView('after')}
          >
            {t('after')}
            {activeView === 'after' && (
              <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-r from-dynamic-light-green/80 to-dynamic-green/80 blur-sm"></div>
            )}
          </button>
        </div>
      </div>

      <div
        className={`comparison-container relative flex flex-col gap-8 lg:flex-row ${
          activeView === t('before')
            ? 'before-only'
            : activeView === t('after')
              ? 'after-only'
              : 'split-view'
        }`}
      >
        {/* Before Card - Hidden when "after" view is active */}
        <div
          ref={beforeRef}
          className={`w-full transition-all duration-500 ${
            activeView === t('after')
              ? 'lg:w-0 lg:opacity-0'
              : activeView === t('before')
                ? 'lg:w-full'
                : ''
          }`}
        >
          <div className="overflow-hidden rounded-xl border border-dynamic-light-red/50 bg-white shadow-lg transition-all duration-300 hover:shadow-xl dark:bg-foreground/5">
            <div className="flex items-center justify-between bg-gradient-to-r from-dynamic-light-red to-dynamic-red p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <CalendarX className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-medium text-white">
                  {t('before')}: {t('traditional_calendar')}
                </h3>
              </div>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white">
                {t('chaotic')}
              </span>
            </div>
            <div className="p-6">
              <div className="mb-6 rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-5">
                <h4 className="mb-3 flex items-center gap-2 font-medium text-dynamic-light-red">
                  <CalendarX className="h-5 w-5" />
                  {t('pain_points')}:
                </h4>
                <ul className="space-y-3 text-sm">
                  <li className="pain-point flex items-start gap-3">
                    <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-dynamic-red"></span>
                    <span className="font-medium">
                      {t(
                        'manually_scheduling_everything_takes_hours_each_week'
                      )}
                    </span>
                  </li>
                  <li className="pain-point flex items-start gap-3">
                    <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-dynamic-red"></span>
                    <span className="font-medium">
                      {t('constant_context_switching_between_tasks')}
                    </span>
                  </li>
                  <li className="pain-point flex items-start gap-3">
                    <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-dynamic-red"></span>
                    <span className="font-medium">
                      {t(
                        'important_tasks_get_buried_under_urgent_but_less_important_ones'
                      )}
                    </span>
                  </li>
                  <li className="pain-point flex items-start gap-3">
                    <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-dynamic-red"></span>
                    <span className="font-medium">
                      {t('no_protection_for_focus_time_or_deep_work')}
                    </span>
                  </li>
                  <li className="pain-point flex items-start gap-3">
                    <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-dynamic-red"></span>
                    <span className="font-medium">
                      {t('constantly_feeling_overwhelmed_and_behind')}
                    </span>
                  </li>
                </ul>
              </div>
              <div className="relative rounded-lg border bg-white p-3 shadow-sm dark:bg-foreground/5">
                <div className="mb-3 grid grid-cols-7 gap-1">
                  {(locale === 'vi'
                    ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
                    : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
                  ).map((day, i) => (
                    <div
                      key={i}
                      className="text-center text-xs font-medium text-muted-foreground"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div className="text-semibold grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }).map((_, i) => {
                    const isOverbooked = [3, 8, 15, 22].includes(i);
                    const hasConflict = [10, 17, 24].includes(i);

                    return (
                      <div
                        key={i}
                        className={`flex aspect-square items-center justify-center rounded-sm border ${
                          isOverbooked
                            ? 'border-dynamic-light-red/30 bg-dynamic-light-red/10 text-dynamic-light-red'
                            : hasConflict
                              ? 'border-dynamic-light-orange/30 bg-dynamic-light-orange/10 text-dynamic-light-orange'
                              : 'bg-foreground/10'
                        }`}
                      >
                        {i + 1}
                        {isOverbooked && (
                          <span className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-dynamic-red"></span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="rounded border border-dynamic-light-red/30 bg-calendar-bg-red p-1.5 text-xs">
                    <div className="font-medium text-dynamic-light-red">
                      {t('8_meetings_overbooked')}
                    </div>
                  </div>
                  <div className="rounded border border-dynamic-light-orange/30 bg-calendar-bg-orange p-1.5 text-xs">
                    <div className="font-medium text-dynamic-light-orange">
                      {t('3_scheduling_conflicts')}
                    </div>
                  </div>
                  <div className="rounded border border-foreground/10 bg-foreground/10 p-1.5 text-xs">
                    <div className="font-medium text-muted-foreground">
                      {t('0_protected_focus_time')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Arrow Between Views */}
        {/* {activeView === 'split' && (
          <div className="hidden items-center justify-center lg:flex">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md">
              <ArrowRight className="h-6 w-6 text-dynamic-light-purple" />
            </div>
          </div>
        )} */}

        {/* After Card - Hidden when "before" view is active */}
        <div
          ref={afterRef}
          className={`w-full transition-all duration-500 ${
            activeView === t('before')
              ? 'lg:w-0 lg:opacity-0'
              : activeView === t('after')
                ? 'lg:w-full'
                : ''
          }`}
        >
          <div className="overflow-hidden rounded-xl border border-dynamic-light-green/50 bg-white shadow-lg transition-all duration-300 hover:shadow-xl dark:bg-foreground/5">
            <div className="flex items-center justify-between bg-gradient-to-r from-dynamic-light-green to-dynamic-green p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <Calendar className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-medium text-white">
                  {t('after')}: {t('tuturuuu_ai_calendar')}
                </h3>
              </div>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white">
                {t('optimized')}
              </span>
            </div>
            <div className="p-6">
              <div className="mb-6 rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-5">
                <h4 className="mb-3 flex items-center gap-2 font-medium text-dynamic-light-green">
                  <AlarmCheck className="h-5 w-5" />
                  {t('benefits.title')}:
                </h4>
                <ul className="space-y-3 text-sm">
                  <li className="benefit-point flex items-start gap-3">
                    <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-dynamic-green"></span>
                    <span className="font-medium">
                      {t(
                        'ai_automatically_schedules_tasks_based_on_priority_and_deadline'
                      )}
                    </span>
                  </li>
                  <li className="benefit-point flex items-start gap-3">
                    <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-dynamic-green"></span>
                    <span className="font-medium">
                      {t(
                        'similar_tasks_are_grouped_to_minimize_context_switching'
                      )}
                    </span>
                  </li>
                  <li className="benefit-point flex items-start gap-3">
                    <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-dynamic-green"></span>
                    <span className="font-medium">
                      {t(
                        'important_tasks_are_prioritized_over_urgent_but_less_important_ones'
                      )}
                    </span>
                  </li>
                  <li className="benefit-point flex items-start gap-3">
                    <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-dynamic-green"></span>
                    <span className="font-medium">
                      {t(
                        'focus_time_is_protected_and_scheduled_during_your_peak_productivity_hours'
                      )}
                    </span>
                  </li>
                  <li className="benefit-point flex items-start gap-3">
                    <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-dynamic-green"></span>
                    <span className="font-medium">
                      {t(
                        'feeling_in_control_and_accomplishing_more_meaningful_work'
                      )}
                    </span>
                  </li>
                </ul>
              </div>
              <div className="relative rounded-lg border bg-white p-3 shadow-sm dark:bg-foreground/5">
                <div className="mb-3 grid grid-cols-7 gap-1">
                  {(locale === 'vi'
                    ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
                    : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
                  ).map((day, i) => (
                    <div
                      key={i}
                      className="text-center text-xs font-medium text-muted-foreground"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 font-semibold">
                  {Array.from({ length: 35 }).map((_, i) => {
                    const hasMeeting = [3, 10, 17, 24].includes(i);
                    const hasFocus = [4, 11, 18, 25].includes(i);
                    const hasTask = [2, 9, 16, 23].includes(i);

                    return (
                      <div
                        key={i}
                        className={`flex aspect-square items-center justify-center rounded-sm border ${
                          hasMeeting
                            ? 'border-dynamic-light-cyan/30 bg-dynamic-light-cyan/10 text-dynamic-light-cyan'
                            : hasFocus
                              ? 'border-dynamic-light-green/30 bg-dynamic-light-green/10 text-dynamic-light-green'
                              : hasTask
                                ? 'border-dynamic-light-purple/30 bg-dynamic-light-purple/10 text-dynamic-light-purple'
                                : 'bg-foreground/10'
                        }`}
                      >
                        {i + 1}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="rounded border border-dynamic-light-cyan/30 bg-calendar-bg-cyan p-1.5 text-xs">
                    <div className="font-medium text-dynamic-light-cyan">
                      {t('4_optimized_meetings')}
                    </div>
                  </div>
                  <div className="rounded border border-dynamic-light-green/30 bg-calendar-bg-green p-1.5 text-xs">
                    <div className="font-medium text-dynamic-light-green">
                      {t('4_protected_focus_blocks')}
                    </div>
                  </div>
                  <div className="rounded border border-dynamic-light-purple/30 bg-calendar-bg-purple p-1.5 text-xs">
                    <div className="font-medium text-dynamic-light-purple">
                      {t('4_prioritized_tasks')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Summary/Statistics */}
      <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex flex-col items-center rounded-xl border border-dynamic-light-red/30 bg-calendar-bg-red p-6 text-center shadow-md backdrop-blur-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-calendar-bg-red">
            <CalendarX className="h-8 w-8 text-dynamic-red" />
          </div>
          <h3 className="mt-4 mb-2 text-2xl font-bold text-dynamic-red">85%</h3>
          <p className="text-muted-foreground">
            {t('time_spent_on_manual_scheduling')}
          </p>
        </div>

        <div className="flex flex-col items-center rounded-xl border border-dynamic-light-purple/30 bg-calendar-bg-purple p-6 text-center shadow-md backdrop-blur-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-calendar-bg-purple">
            <Workflow className="h-8 w-8 text-dynamic-purple" />
          </div>
          <h3 className="mt-4 mb-2 text-2xl font-bold text-dynamic-purple">
            10+
          </h3>
          <p className="text-muted-foreground">
            {t('hours_of_deep_work_gained_weekly')}
          </p>
        </div>

        <div className="flex flex-col items-center rounded-xl border border-dynamic-light-green/30 bg-calendar-bg-green p-6 text-center shadow-md backdrop-blur-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-calendar-bg-green">
            <UserCheck className="h-8 w-8 text-dynamic-green" />
          </div>
          <h3 className="mt-4 mb-2 text-2xl font-bold text-dynamic-green">
            96%
          </h3>
          <p className="text-muted-foreground">
            {t('users_report_reduced_stress')}
          </p>
        </div>
      </div>
    </section>
  );
}
