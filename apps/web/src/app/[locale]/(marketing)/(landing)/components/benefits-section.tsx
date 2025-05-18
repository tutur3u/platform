'use client';

import { Activity, CheckCircle, Clock, Target } from '@tuturuuu/ui/icons';
import { useRef } from 'react';

const benefits = [
  'Reduce time spent on scheduling by 85%',
  'Never miss a deadline again',
  'Balance workload to prevent burnout',
  'Gain 10+ hours of meaningful work time weekly',
  'Eliminate the stress of manual prioritization',
  'Ensure team alignment without endless emails',
  'Make time for what truly matters to you',
];

export function BenefitsSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  return (
    <section
      id="benefits"
      ref={sectionRef}
      className="relative container w-full overflow-hidden px-4 py-24 md:px-6 md:py-40"
    >
      {/* Background accents */}
      <div className="absolute top-40 -left-20 h-64 w-64 rounded-full bg-dynamic-light-purple/20 blur-3xl filter"></div>
      <div className="absolute -right-20 bottom-40 h-64 w-64 rounded-full bg-dynamic-light-cyan/20 blur-3xl filter"></div>

      <div className="benefits-title-wrapper mb-16 text-center">
        <h2 className="benefits-title mb-6 text-4xl font-bold md:text-5xl">
          <span className="bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-cyan bg-clip-text text-transparent">
            Reclaim Your Time for What Matters
          </span>
        </h2>
        <p className="mx-auto max-w-3xl text-xl leading-relaxed text-muted-foreground">
          Tuturuuu doesn't just manage your calendar—it gives you back time for
          meaningful work and life.
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
                    <p className="text-lg font-medium">{benefit}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="order-1 w-full lg:order-2 lg:w-1/2" ref={imageRef}>
          <div className="relative">
            <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-dynamic-light-purple opacity-20 blur-3xl filter"></div>
            <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-dynamic-light-cyan opacity-20 blur-3xl filter"></div>

            <div className="relative overflow-hidden rounded-xl border bg-white/90 shadow-xl backdrop-blur-sm dark:bg-foreground/10 dark:backdrop-blur-sm">
              <div className="bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-cyan p-5 text-white">
                <h3 className="text-lg font-semibold">
                  Time Reclaimed Dashboard
                </h3>
              </div>

              <div className="p-6">
                <div className="mb-6">
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                    Meaningful Work Time
                  </h4>
                  <div className="h-5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div className="progress-bar-1 h-full w-3/4 rounded-full bg-gradient-to-r from-dynamic-green to-dynamic-green/70"></div>
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="font-medium">Current: 28h/week</span>
                    <span className="font-medium text-dynamic-green">
                      +75% from last month
                    </span>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                    Task Completion Rate
                  </h4>
                  <div className="h-5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div className="progress-bar-2 h-full w-9/10 rounded-full bg-gradient-to-r from-dynamic-blue to-dynamic-light-blue"></div>
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="font-medium">Score: 9.2/10</span>
                    <span className="font-medium text-dynamic-blue">
                      Outstanding
                    </span>
                  </div>
                </div>

                <div className="mb-6 rounded-lg bg-gray-50 p-4 dark:bg-foreground/5">
                  <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                    Time Reclaimed
                  </h4>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="h-8 w-8 text-dynamic-purple" />
                      <div className="text-3xl font-bold text-dynamic-purple">
                        10.5 hours
                      </div>
                    </div>
                    <div className="rounded-full bg-dynamic-light-purple/20 px-3 py-1 text-sm font-medium text-dynamic-purple">
                      this week
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="transform rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-4 transition-all duration-300 hover:shadow-md">
                    <div className="mb-2 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-dynamic-purple" />
                      <div className="text-sm font-medium text-dynamic-purple">
                        Workload Balance
                      </div>
                    </div>
                    <div className="text-lg font-bold text-dynamic-purple">
                      Optimal
                    </div>
                  </div>

                  <div className="transform rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-4 transition-all duration-300 hover:shadow-md">
                    <div className="mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4 text-dynamic-blue" />
                      <div className="text-sm font-medium text-dynamic-blue">
                        Deadline Success
                      </div>
                    </div>
                    <div className="text-lg font-bold text-dynamic-blue">
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
