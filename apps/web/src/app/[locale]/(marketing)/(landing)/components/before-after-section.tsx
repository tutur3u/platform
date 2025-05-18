'use client';

import { Button } from '@tuturuuu/ui/button';
import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import {
  AlarmCheck,
  ArrowRight,
  Calendar,
  CalendarX,
  UserCheck,
  Workflow,
} from '@tuturuuu/ui/icons';
import { useEffect, useRef, useState } from 'react';

gsap.registerPlugin(ScrollTrigger);

export function BeforeAfterSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<'split' | 'before' | 'after'>(
    'split'
  );

  useEffect(() => {
    if (!sectionRef.current) return;

    // Title animation
    gsap.from('.before-after-title-wrapper', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.before-after-title-wrapper',
        start: 'top bottom-=100',
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
      },
    });

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
        },
        delay: 0.3,
      });

      // Pain points and benefits staggered animation
      gsap.from('.pain-point', {
        x: -20,
        opacity: 0,
        duration: 0.4,
        stagger: 0.1,
        scrollTrigger: {
          trigger: '.comparison-container',
          start: 'top bottom-=50',
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
        },
        delay: 0.5,
      });
    }

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, [activeView]);

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden py-24 md:py-40"
    >
      {/* Background decorations */}
      <div className="bg-dynamic-light-red/10 absolute -left-40 top-40 h-96 w-96 rounded-full blur-3xl filter"></div>
      <div className="bg-dynamic-light-green/10 absolute -bottom-20 -right-40 h-96 w-96 rounded-full blur-3xl filter"></div>

      <div className="container mx-auto px-4">
        <div className="before-after-title-wrapper mb-10 text-center">
          <h2 className="before-after-title mb-6 text-4xl font-bold md:text-5xl">
            <span className="from-dynamic-light-purple to-dynamic-light-cyan bg-gradient-to-r bg-clip-text text-transparent">
              Before & After Tuturuuu
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-3xl text-xl leading-relaxed">
            See the transformation in your calendar and life when you switch to
            AI-powered scheduling
          </p>
        </div>

        {/* Comparison Tabs */}
        <div className="comparison-tabs mb-10 flex justify-center">
          <div className="dark:bg-foreground/5 inline-flex rounded-full bg-white/90 p-1.5 shadow-md backdrop-blur-sm">
            <button
              className={`relative rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
                activeView === 'split'
                  ? 'from-dynamic-light-red to-dynamic-light-green bg-gradient-to-r text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveView('split')}
            >
              Split View
              {activeView === 'split' && (
                <div className="from-dynamic-light-red/80 to-dynamic-light-green/80 absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-r blur-sm"></div>
              )}
            </button>
            <button
              className={`relative rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
                activeView === 'before'
                  ? 'from-dynamic-light-red to-dynamic-red bg-gradient-to-r text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveView('before')}
            >
              Before
              {activeView === 'before' && (
                <div className="from-dynamic-light-red/80 to-dynamic-red/80 absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-r blur-sm"></div>
              )}
            </button>
            <button
              className={`relative rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
                activeView === 'after'
                  ? 'from-dynamic-light-green to-dynamic-green bg-gradient-to-r text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveView('after')}
            >
              After
              {activeView === 'after' && (
                <div className="from-dynamic-light-green/80 to-dynamic-green/80 absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-r blur-sm"></div>
              )}
            </button>
          </div>
        </div>

        <div
          className={`comparison-container relative flex flex-col gap-8 lg:flex-row ${
            activeView === 'before'
              ? 'before-only'
              : activeView === 'after'
                ? 'after-only'
                : 'split-view'
          }`}
        >
          {/* Before Card - Hidden when "after" view is active */}
          <div
            ref={beforeRef}
            className={`w-full transition-all duration-500 lg:w-1/2 ${
              activeView === 'after'
                ? 'lg:w-0 lg:opacity-0'
                : activeView === 'before'
                  ? 'lg:w-full'
                  : ''
            }`}
          >
            <div className="border-dynamic-light-red/50 dark:bg-foreground/5 overflow-hidden rounded-xl border bg-white shadow-lg transition-all duration-300 hover:shadow-xl">
              <div className="from-dynamic-light-red to-dynamic-red flex items-center justify-between bg-gradient-to-r p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                    <CalendarX className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-medium text-white">
                    Before: Traditional Calendar
                  </h3>
                </div>
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white">
                  Chaotic
                </span>
              </div>
              <div className="p-6">
                <div className="border-dynamic-light-red/30 bg-calendar-bg-red mb-6 rounded-lg border p-5">
                  <h4 className="text-dynamic-light-red mb-3 flex items-center gap-2 font-medium">
                    <CalendarX className="h-5 w-5" />
                    Pain Points:
                  </h4>
                  <ul className="space-y-3 text-sm">
                    <li className="pain-point flex items-start gap-3">
                      <span className="bg-dynamic-red mt-1.5 inline-block h-2 w-2 rounded-full"></span>
                      <span className="font-medium">
                        Manually scheduling everything takes hours each week
                      </span>
                    </li>
                    <li className="pain-point flex items-start gap-3">
                      <span className="bg-dynamic-red mt-1.5 inline-block h-2 w-2 rounded-full"></span>
                      <span className="font-medium">
                        Constant context switching between tasks
                      </span>
                    </li>
                    <li className="pain-point flex items-start gap-3">
                      <span className="bg-dynamic-red mt-1.5 inline-block h-2 w-2 rounded-full"></span>
                      <span className="font-medium">
                        Important tasks get buried under urgent but less
                        important ones
                      </span>
                    </li>
                    <li className="pain-point flex items-start gap-3">
                      <span className="bg-dynamic-red mt-1.5 inline-block h-2 w-2 rounded-full"></span>
                      <span className="font-medium">
                        No protection for focus time or deep work
                      </span>
                    </li>
                    <li className="pain-point flex items-start gap-3">
                      <span className="bg-dynamic-red mt-1.5 inline-block h-2 w-2 rounded-full"></span>
                      <span className="font-medium">
                        Constantly feeling overwhelmed and behind
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="dark:bg-foreground/5 relative rounded-lg border bg-white p-3 shadow-sm">
                  <div className="mb-3 grid grid-cols-7 gap-1">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                      <div
                        key={i}
                        className="text-muted-foreground text-center text-xs font-medium"
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
                            <span className="bg-dynamic-red absolute right-0 top-0 h-1.5 w-1.5 rounded-full"></span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="border-dynamic-light-red/30 bg-calendar-bg-red rounded border p-1.5 text-xs">
                      <div className="text-dynamic-light-red font-medium">
                        8 meetings (overbooked!)
                      </div>
                    </div>
                    <div className="border-dynamic-light-orange/30 bg-calendar-bg-orange rounded border p-1.5 text-xs">
                      <div className="text-dynamic-light-orange font-medium">
                        3 scheduling conflicts
                      </div>
                    </div>
                    <div className="border-foreground/10 bg-foreground/10 rounded border p-1.5 text-xs">
                      <div className="text-muted-foreground font-medium">
                        0 protected focus time
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Arrow Between Views */}
          {activeView === 'split' && (
            <div className="hidden items-center justify-center lg:flex">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md">
                <ArrowRight className="text-dynamic-light-purple h-6 w-6" />
              </div>
            </div>
          )}

          {/* After Card - Hidden when "before" view is active */}
          <div
            ref={afterRef}
            className={`w-full transition-all duration-500 lg:w-1/2 ${
              activeView === 'before'
                ? 'lg:w-0 lg:opacity-0'
                : activeView === 'after'
                  ? 'lg:w-full'
                  : ''
            }`}
          >
            <div className="border-dynamic-light-green/50 dark:bg-foreground/5 overflow-hidden rounded-xl border bg-white shadow-lg transition-all duration-300 hover:shadow-xl">
              <div className="from-dynamic-light-green to-dynamic-green flex items-center justify-between bg-gradient-to-r p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                    <Calendar className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-medium text-white">
                    After: Tuturuuu AI Calendar
                  </h3>
                </div>
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white">
                  Optimized
                </span>
              </div>
              <div className="p-6">
                <div className="border-dynamic-light-green/30 bg-calendar-bg-green mb-6 rounded-lg border p-5">
                  <h4 className="text-dynamic-light-green mb-3 flex items-center gap-2 font-medium">
                    <AlarmCheck className="h-5 w-5" />
                    Benefits:
                  </h4>
                  <ul className="space-y-3 text-sm">
                    <li className="benefit-point flex items-start gap-3">
                      <span className="bg-dynamic-green mt-1.5 inline-block h-2 w-2 rounded-full"></span>
                      <span className="font-medium">
                        AI automatically schedules tasks based on priority and
                        deadline
                      </span>
                    </li>
                    <li className="benefit-point flex items-start gap-3">
                      <span className="bg-dynamic-green mt-1.5 inline-block h-2 w-2 rounded-full"></span>
                      <span className="font-medium">
                        Similar tasks are grouped to minimize context switching
                      </span>
                    </li>
                    <li className="benefit-point flex items-start gap-3">
                      <span className="bg-dynamic-green mt-1.5 inline-block h-2 w-2 rounded-full"></span>
                      <span className="font-medium">
                        Important tasks are prioritized over urgent but less
                        important ones
                      </span>
                    </li>
                    <li className="benefit-point flex items-start gap-3">
                      <span className="bg-dynamic-green mt-1.5 inline-block h-2 w-2 rounded-full"></span>
                      <span className="font-medium">
                        Focus time is protected and scheduled during your peak
                        productivity hours
                      </span>
                    </li>
                    <li className="benefit-point flex items-start gap-3">
                      <span className="bg-dynamic-green mt-1.5 inline-block h-2 w-2 rounded-full"></span>
                      <span className="font-medium">
                        Feeling in control and accomplishing more meaningful
                        work
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="dark:bg-foreground/5 relative rounded-lg border bg-white p-3 shadow-sm">
                  <div className="mb-3 grid grid-cols-7 gap-1">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                      <div
                        key={i}
                        className="text-muted-foreground text-center text-xs font-medium"
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
                    <div className="border-dynamic-light-cyan/30 bg-calendar-bg-cyan rounded border p-1.5 text-xs">
                      <div className="text-dynamic-light-cyan font-medium">
                        4 optimized meetings
                      </div>
                    </div>
                    <div className="border-dynamic-light-green/30 bg-calendar-bg-green rounded border p-1.5 text-xs">
                      <div className="text-dynamic-light-green font-medium">
                        4 protected focus blocks
                      </div>
                    </div>
                    <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded border p-1.5 text-xs">
                      <div className="text-dynamic-light-purple font-medium">
                        4 prioritized tasks
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
          <div className="border-dynamic-light-red/30 dark:bg-foreground/5 flex flex-col items-center rounded-xl border bg-white/90 p-6 text-center shadow-md backdrop-blur-sm">
            <div className="bg-calendar-bg-red flex h-16 w-16 items-center justify-center rounded-full">
              <CalendarX className="text-dynamic-red h-8 w-8" />
            </div>
            <h3 className="text-dynamic-red mb-2 mt-4 text-2xl font-bold">
              85%
            </h3>
            <p className="text-muted-foreground">
              Time spent on manual scheduling
            </p>
          </div>

          <div className="dark:bg-foreground/5 flex flex-col items-center rounded-xl border bg-white/90 p-6 text-center shadow-md backdrop-blur-sm">
            <div className="bg-calendar-bg-purple flex h-16 w-16 items-center justify-center rounded-full">
              <Workflow className="text-dynamic-purple h-8 w-8" />
            </div>
            <h3 className="text-dynamic-purple mb-2 mt-4 text-2xl font-bold">
              10+
            </h3>
            <p className="text-muted-foreground">
              Hours of deep work gained weekly
            </p>
          </div>

          <div className="border-dynamic-light-green/30 dark:bg-foreground/5 flex flex-col items-center rounded-xl border bg-white/90 p-6 text-center shadow-md backdrop-blur-sm">
            <div className="bg-calendar-bg-green flex h-16 w-16 items-center justify-center rounded-full">
              <UserCheck className="text-dynamic-green h-8 w-8" />
            </div>
            <h3 className="text-dynamic-green mb-2 mt-4 text-2xl font-bold">
              96%
            </h3>
            <p className="text-muted-foreground">Users report reduced stress</p>
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <Button className="from-dynamic-light-purple to-dynamic-light-cyan bg-gradient-to-r text-white hover:shadow-lg">
            Transform Your Calendar
          </Button>
        </div>
      </div>
    </section>
  );
}
