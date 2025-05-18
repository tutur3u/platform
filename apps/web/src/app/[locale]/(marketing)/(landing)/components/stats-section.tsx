'use client';

import { gsap } from '@tuturuuu/ui/gsap';
import { Calendar, Clock, Users, Zap } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

export function StatsSection() {
  const t = useTranslations('landing');
  const sectionRef = useRef<HTMLDivElement>(null);

  const stats = [
    {
      icon: <Clock className="h-8 w-8 text-dynamic-purple" />,
      value: '10+',
      label: t('stats.hours_saved_weekly'),
      text: 'text-dynamic-purple',
      bg: 'bg-calendar-bg-purple border-dynamic-light-purple',
      description: t(
        'stats.our_users_report_saving_over_10_hours_every_week_on_scheduling_and_task_management'
      ),
    },
    {
      icon: <Calendar className="h-8 w-8 text-dynamic-blue" />,
      value: '85%',
      label: t('stats.reduction_in_scheduling_time'),
      text: 'text-dynamic-blue',
      bg: 'bg-calendar-bg-blue border-dynamic-light-blue',
      description: t(
        'stats.tuturuuu_reduces_the_time_spent_on_scheduling_by_85_compared_to_manual_methods'
      ),
    },
    {
      icon: <Users className="h-8 w-8 text-dynamic-green" />,
      value: '94%',
      label: t('stats.user_satisfaction'),
      text: 'text-dynamic-green',
      bg: 'bg-calendar-bg-green border-dynamic-light-green',
      description: t(
        'stats.94_of_our_users_report_feeling_less_stressed_and_more_in_control_of_their_time'
      ),
    },
    {
      icon: <Zap className="h-8 w-8 text-dynamic-orange" />,
      value: '3x',
      label: t('stats.productivity_increase'),
      text: 'text-dynamic-orange',
      bg: 'bg-calendar-bg-orange border-dynamic-light-orange',
      description: t(
        'stats.users_report_completing_3x_more_meaningful_work_after_switching_to_tuturuuu'
      ),
    },
  ];

  useEffect(() => {
    if (!sectionRef.current) return;

    const ctx = gsap.context(
      () => {
        gsap.from('.stat-item', {
          y: 50,
          opacity: 0,
          duration: 0.6,
          stagger: 0.2,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: sectionRef.current, // Use sectionRef as trigger
            start: 'top bottom-=100',
            toggleActions: 'play none none none',
          },
        });
      },
      sectionRef // Scope GSAP context to the sectionRef
    );

    return () => {
      ctx.revert(); // Cleanup GSAP animations and ScrollTriggers
    };
  }, []);

  return (
    <section
      ref={sectionRef} // Add ref here
      className="container px-0 pt-20"
    >
      <div className="mb-16 text-center">
        <h2 className="stats-title mb-4 text-3xl font-bold md:text-4xl">
          <span>
            {t('stats.the')}{' '}
            <span className="bg-gradient-to-r from-dynamic-light-indigo from-10% via-dynamic-light-orange via-30% to-dynamic-light-green to-90% bg-clip-text text-transparent">
              Tuturuuu
            </span>{' '}
            {t('stats.impact')}
          </span>
        </h2>
        <p className="stats-title mx-auto max-w-3xl text-xl text-muted-foreground">
          {t(
            'stats.real_results_from_real_users_who_have_transformed_their_productivity'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className={cn(
              'stat-item rounded-xl border bg-foreground/10 p-6 transition-shadow duration-300',
              stat.bg
            )}
          >
            <div
              className={cn(
                'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full'
              )}
            >
              {stat.icon}
            </div>
            <div className="text-center text-balance">
              <div className={cn('mb-2 text-4xl font-bold', stat.text)}>
                {stat.value}
              </div>
              <h3 className="mb-2 text-lg font-semibold">{stat.label}</h3>
              <p className="text-sm text-muted-foreground">
                {stat.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
