'use client';

import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import { Calendar, Clock, Users, Zap } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

const stats = [
  {
    icon: <Clock className="h-8 w-8 text-dynamic-purple" />,
    value: '10+',
    label: 'Hours Saved Weekly',
    text: 'text-dynamic-purple',
    bg: 'bg-calendar-bg-purple border-dynamic-light-purple',
    description:
      'Our users report saving over 10 hours every week on scheduling and task management',
  },
  {
    icon: <Calendar className="h-8 w-8 text-dynamic-blue" />,
    value: '85%',
    label: 'Reduction in Scheduling Time',
    text: 'text-dynamic-blue',
    bg: 'bg-calendar-bg-blue border-dynamic-light-blue',
    description:
      'TuPlan reduces the time spent on scheduling by 85% compared to manual methods',
  },
  {
    icon: <Users className="h-8 w-8 text-dynamic-green" />,
    value: '94%',
    label: 'User Satisfaction',
    text: 'text-dynamic-green',
    bg: 'bg-calendar-bg-green border-dynamic-light-green',
    description:
      '94% of our users report feeling less stressed and more in control of their time',
  },
  {
    icon: <Zap className="h-8 w-8 text-dynamic-orange" />,
    value: '3x',
    label: 'Productivity Increase',
    text: 'text-dynamic-orange',
    bg: 'bg-calendar-bg-orange border-dynamic-light-orange',
    description:
      'Users report completing 3x more meaningful work after switching to TuPlan',
  },
];

export function StatsSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    gsap.from('.stats-title', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.stats-title',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    const statItems = gsap.utils.toArray('.stat-item') as Element[];

    statItems.forEach((item, index) => {
      gsap.from(item, {
        y: 50,
        opacity: 0,
        duration: 0.8,
        scrollTrigger: {
          trigger: item as Element,
          start: 'top bottom-=100',
          toggleActions: 'play none none none',
        },
        delay: index * 0.1,
      });
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return (
    <section ref={sectionRef} className="pt-20">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="stats-title mb-4 text-3xl font-bold md:text-4xl">
            <span>
              The{' '}
              <span className="bg-gradient-to-r from-dynamic-light-indigo from-10% via-dynamic-light-orange via-30% to-dynamic-light-green to-90% bg-clip-text text-transparent">
                Tuturuuu
              </span>{' '}
              Impact
            </span>
          </h2>
          <p className="stats-title mx-auto max-w-3xl text-xl text-muted-foreground">
            Real results from real users who have transformed their
            productivity.
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
      </div>
    </section>
  );
}
