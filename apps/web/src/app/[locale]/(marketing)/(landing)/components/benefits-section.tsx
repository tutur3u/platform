'use client';

import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import { Activity, CheckCircle, Clock, Target } from '@tuturuuu/ui/icons';
import { useEffect, useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

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

  useEffect(() => {
    if (!sectionRef.current || !imageRef.current) return;

    // Header animations
    gsap.from('.benefits-title-wrapper', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.benefits-title-wrapper',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    // Dashboard animation with bounce effect
    gsap.from(imageRef.current, {
      y: 40,
      x: 20,
      opacity: 0,
      duration: 1.2,
      ease: 'back.out(1.2)',
      scrollTrigger: {
        trigger: imageRef.current,
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    // Progress bar animations
    gsap.to('.progress-bar-1', {
      width: '85%',
      duration: 1.5,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: imageRef.current,
        start: 'top bottom-=100',
      },
    });

    gsap.to('.progress-bar-2', {
      width: '92%',
      duration: 1.8,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: imageRef.current,
        start: 'top bottom-=100',
      },
    });

    // Benefit items animation with stagger
    const benefitItems = gsap.utils.toArray('.benefit-item') as Element[];
    gsap.from(benefitItems, {
      x: -30,
      opacity: 0,
      duration: 0.5,
      stagger: 0.1,
      scrollTrigger: {
        trigger: '.benefit-items-container',
        start: 'top bottom-=100',
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return (
    <section
      id="benefits"
      ref={sectionRef}
      className="container relative w-full overflow-hidden px-4 py-24 md:px-6 md:py-40"
    >
      {/* Background accents */}
      <div className="bg-dynamic-light-purple/20 absolute -left-20 top-40 h-64 w-64 rounded-full blur-3xl filter"></div>
      <div className="bg-dynamic-light-cyan/20 absolute -right-20 bottom-40 h-64 w-64 rounded-full blur-3xl filter"></div>

      <div className="benefits-title-wrapper mb-16 text-center">
        <h2 className="benefits-title mb-6 text-4xl font-bold md:text-5xl">
          <span className="from-dynamic-light-purple to-dynamic-light-cyan bg-gradient-to-r bg-clip-text text-transparent">
            Reclaim Your Time for What Matters
          </span>
        </h2>
        <p className="text-muted-foreground mx-auto max-w-3xl text-xl leading-relaxed">
          TuPlan doesn't just manage your calendar—it gives you back time for
          meaningful work and life.
        </p>
      </div>

      <div className="flex flex-col items-center gap-16 lg:flex-row">
        <div className="order-2 w-full lg:order-1 lg:w-1/2">
          <div className="benefit-items-container space-y-5">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="benefit-item bg-card/30 hover:border-dynamic-light-purple/20 hover:bg-card/50 transform rounded-lg border border-transparent p-4 transition-all duration-300 hover:shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="bg-dynamic-light-purple/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
                    <CheckCircle className="text-dynamic-purple h-5 w-5" />
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
            <div className="bg-dynamic-light-purple absolute -left-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-3xl filter"></div>
            <div className="bg-dynamic-light-cyan absolute -bottom-10 -right-10 h-40 w-40 rounded-full opacity-20 blur-3xl filter"></div>

            <div className="dark:bg-foreground/10 relative overflow-hidden rounded-xl border bg-white/90 shadow-xl backdrop-blur-sm dark:backdrop-blur-sm">
              <div className="from-dynamic-light-purple to-dynamic-light-cyan bg-gradient-to-r p-5 text-white">
                <h3 className="text-lg font-semibold">
                  Time Reclaimed Dashboard
                </h3>
              </div>

              <div className="p-6">
                <div className="mb-6">
                  <h4 className="text-muted-foreground mb-2 text-sm font-medium">
                    Meaningful Work Time
                  </h4>
                  <div className="bg-foreground/10 h-5 w-full overflow-hidden rounded-full">
                    <div className="progress-bar-1 from-dynamic-green to-dynamic-green/70 h-full w-0 rounded-full bg-gradient-to-r"></div>
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="font-medium">Current: 28h/week</span>
                    <span className="text-dynamic-green font-medium">
                      +75% from last month
                    </span>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="text-muted-foreground mb-2 text-sm font-medium">
                    Task Completion Rate
                  </h4>
                  <div className="bg-foreground/10 h-5 w-full overflow-hidden rounded-full">
                    <div className="progress-bar-2 from-dynamic-blue to-dynamic-light-blue h-full w-0 rounded-full bg-gradient-to-r"></div>
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="font-medium">Score: 9.2/10</span>
                    <span className="text-dynamic-blue font-medium">
                      Outstanding
                    </span>
                  </div>
                </div>

                <div className="dark:bg-foreground/5 mb-6 rounded-lg bg-gray-50 p-4">
                  <h4 className="text-muted-foreground mb-3 text-sm font-medium">
                    Time Reclaimed
                  </h4>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="text-dynamic-purple h-8 w-8" />
                      <div className="text-dynamic-purple text-3xl font-bold">
                        10.5 hours
                      </div>
                    </div>
                    <div className="bg-dynamic-light-purple/20 text-dynamic-purple rounded-full px-3 py-1 text-sm font-medium">
                      this week
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple transform rounded-lg border p-4 transition-all duration-300 hover:shadow-md">
                    <div className="mb-2 flex items-center gap-2">
                      <Activity className="text-dynamic-purple h-4 w-4" />
                      <div className="text-dynamic-purple text-sm font-medium">
                        Workload Balance
                      </div>
                    </div>
                    <div className="text-dynamic-purple text-lg font-bold">
                      Optimal
                    </div>
                  </div>

                  <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue transform rounded-lg border p-4 transition-all duration-300 hover:shadow-md">
                    <div className="mb-2 flex items-center gap-2">
                      <Target className="text-dynamic-blue h-4 w-4" />
                      <div className="text-dynamic-blue text-sm font-medium">
                        Deadline Success
                      </div>
                    </div>
                    <div className="text-dynamic-blue text-lg font-bold">
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
