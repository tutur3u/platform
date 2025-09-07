'use client';

import { Activity, CheckCircle, Clock, Target } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

export function BenefitsSection() {
  const t = useTranslations('landing');

  const benefits = [
    t('reduce_time_spent_on_scheduling_by_85'),
    t('never_miss_a_deadline_again'),
    t('balance_workload_to_prevent_burnout'),
    t('gain_10_hours_of_meaningful_work_time_weekly'),
    t('eliminate_the_stress_of_manual_prioritization'),
    t('ensure_team_alignment_without_endless_emails'),
    t('make_time_for_what_truly_matters_to_you'),
  ];

  const sectionRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  return (
    <section
      id="benefits"
      ref={sectionRef}
      className="container relative w-full px-0 py-24 md:py-40"
    >
      {/* Background accents */}
      <div className="-left-20 absolute top-40 h-64 w-64 rounded-full bg-dynamic-light-purple/20 blur-3xl filter"></div>
      <div className="-right-20 absolute bottom-40 h-64 w-64 rounded-full bg-dynamic-light-cyan/20 blur-3xl filter"></div>

      <div className="benefits-title-wrapper mb-16 text-center">
        <h2 className="benefits-title mb-6 font-bold text-4xl md:text-5xl">
          <span className="text-balance bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-cyan bg-clip-text text-transparent">
            {t('reclaim_your_time_for_what_matters')}
          </span>
        </h2>
        <p className="mx-auto max-w-3xl text-balance text-muted-foreground text-xl leading-relaxed">
          {t('reclaim_your_time_for_what_matters_description')}
        </p>
      </div>

      <div className="flex flex-col items-center gap-16 lg:flex-row">
        <div className="order-2 w-full lg:order-1 lg:w-1/2">
          <div className="benefit-items-container space-y-5">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="benefit-item transform rounded-lg border border-transparent bg-card/30 p-4 transition-all duration-300 hover:border-dynamic-light-purple/20 hover:bg-card/50 hover:shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-dynamic-light-purple/10">
                    <CheckCircle className="h-5 w-5 text-dynamic-purple" />
                  </div>
                  <div>
                    <p className="font-medium text-lg">{benefit}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="order-1 w-full lg:order-2 lg:w-1/2" ref={imageRef}>
          <div className="relative">
            <div className="-top-10 -left-10 absolute h-40 w-40 rounded-full bg-dynamic-light-purple opacity-20 blur-3xl filter"></div>
            <div className="-right-10 -bottom-10 absolute h-40 w-40 rounded-full bg-dynamic-light-cyan opacity-20 blur-3xl filter"></div>

            <div className="relative overflow-hidden rounded-xl border bg-white/90 shadow-xl backdrop-blur-sm dark:bg-foreground/10 dark:backdrop-blur-sm">
              <div className="bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-cyan p-5 text-white">
                <h3 className="font-semibold text-lg">
                  {t('time_reclaimed_dashboard')}
                </h3>
              </div>

              <div className="p-6">
                <div className="mb-6">
                  <h4 className="mb-2 font-medium text-muted-foreground text-sm">
                    {t('meaningful_work_time')}
                  </h4>
                  <div className="h-5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div className="progress-bar-1 h-full w-3/4 rounded-full bg-gradient-to-r from-dynamic-green to-dynamic-green/70"></div>
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="font-medium">
                      {t('current')}: 28h/{t('week')}
                    </span>
                    <span className="font-medium text-dynamic-green">
                      +75% {t('from_last_month')}
                    </span>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="mb-2 font-medium text-muted-foreground text-sm">
                    {t('task_completion_rate')}
                  </h4>
                  <div className="h-5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div className="progress-bar-2 h-full w-9/10 rounded-full bg-gradient-to-r from-dynamic-blue to-dynamic-light-blue"></div>
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="font-medium">{t('score')}: 9.2/10</span>
                    <span className="font-medium text-dynamic-blue">
                      {t('outstanding')}
                    </span>
                  </div>
                </div>

                <div className="mb-6 rounded-lg bg-gray-50 p-4 dark:bg-foreground/5">
                  <h4 className="mb-3 font-medium text-muted-foreground text-sm">
                    {t('time_reclaimed')}
                  </h4>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="h-8 w-8 text-dynamic-purple" />
                      <div className="font-bold text-3xl text-dynamic-purple">
                        10.5 {t('hours')}
                      </div>
                    </div>
                    <div className="rounded-full bg-dynamic-light-purple/20 px-3 py-1 font-medium text-dynamic-purple text-sm">
                      {t('this_week')}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="transform rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-4 transition-all duration-300 hover:shadow-md">
                    <div className="mb-2 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-dynamic-purple" />
                      <div className="font-medium text-dynamic-purple text-sm">
                        {t('workload_balance')}
                      </div>
                    </div>
                    <div className="font-bold text-dynamic-purple text-lg">
                      {t('optimal')}
                    </div>
                  </div>

                  <div className="transform rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-4 transition-all duration-300 hover:shadow-md">
                    <div className="mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4 text-dynamic-blue" />
                      <div className="font-medium text-dynamic-blue text-sm">
                        {t('deadline_success')}
                      </div>
                    </div>
                    <div className="font-bold text-dynamic-blue text-lg">
                      100%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
