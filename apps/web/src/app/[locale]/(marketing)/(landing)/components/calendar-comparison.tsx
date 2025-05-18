'use client';

import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import { Check, X } from '@tuturuuu/ui/icons';
import { useEffect, useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

const comparisonFeatures = [
  {
    feature: 'Smart task scheduling',
    tuplan: true,
    google: false,
    description:
      'Automatically schedules tasks based on priority, deadline, and workload',
  },
  {
    feature: 'AI-powered prioritization',
    tuplan: true,
    google: false,
    description:
      'Intelligently prioritizes tasks based on importance and urgency',
  },
  {
    feature: 'Workload balancing',
    tuplan: true,
    google: false,
    description:
      'Prevents overloading your schedule by distributing tasks evenly',
  },
  {
    feature: 'Focus time protection',
    tuplan: true,
    google: false,
    description:
      'Automatically blocks out time for deep work based on your productivity patterns',
  },
  {
    feature: 'Team availability matching',
    tuplan: true,
    google: false,
    description:
      "Finds optimal meeting times based on everyone's schedule and preferences",
  },
  {
    feature: 'Natural language input',
    tuplan: true,
    google: false,
    description: 'Create tasks and events using everyday language',
  },
  {
    feature: 'Deadline management',
    tuplan: true,
    google: false,
    description:
      'Ensures you never miss a deadline by optimizing your schedule',
  },
  {
    feature: 'Basic calendar functionality',
    tuplan: true,
    google: true,
    description: 'Create, edit, and view events on a calendar',
  },
];

export function CalendarComparison() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    gsap.from('.comparison-title', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.comparison-title',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    gsap.from('.comparison-table', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.comparison-table',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return (
    <section id="comparison" ref={sectionRef} className="bg-gray-50 py-20">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="comparison-title mb-4 text-3xl font-bold md:text-4xl">
            <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
              TuPlan vs. Google Calendar
            </span>
          </h2>
          <p className="comparison-title mx-auto max-w-3xl text-xl text-muted-foreground">
            See how TuPlan's AI-powered features transform your calendar
            experience compared to traditional calendars.
          </p>
        </div>

        <div className="comparison-table mx-auto max-w-4xl overflow-hidden rounded-xl bg-white shadow-lg">
          <div className="grid grid-cols-12 bg-gradient-to-r from-purple-600 to-blue-500 p-4 text-white">
            <div className="col-span-6 text-lg font-medium">Feature</div>
            <div className="col-span-3 text-center text-lg font-medium">
              TuPlan
            </div>
            <div className="col-span-3 text-center text-lg font-medium">
              Google Calendar
            </div>
          </div>

          {comparisonFeatures.map((item, index) => (
            <div
              key={index}
              className={`grid grid-cols-12 items-center p-4 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
            >
              <div className="col-span-6">
                <p className="font-medium">{item.feature}</p>
                <p className="text-sm text-gray-500">{item.description}</p>
              </div>
              <div className="col-span-3 flex justify-center">
                {item.tuplan ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                    <Check className="h-5 w-5 text-green-600" />
                  </div>
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                    <X className="h-5 w-5 text-red-600" />
                  </div>
                )}
              </div>
              <div className="col-span-3 flex justify-center">
                {item.google ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                    <Check className="h-5 w-5 text-green-600" />
                  </div>
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                    <X className="h-5 w-5 text-red-600" />
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="border-t border-purple-100 bg-purple-50 p-6">
            <p className="text-center font-medium text-purple-800">
              TuPlan offers 7 advanced features that Google Calendar doesn't
              have, helping you save 10+ hours weekly.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
