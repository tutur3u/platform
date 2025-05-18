'use client';

import {
  Briefcase,
  GraduationCap,
  Heart,
  Home,
  Users,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useRef } from 'react';

const useCases = [
  {
    icon: <Briefcase className="h-6 w-6 text-dynamic-purple" />,
    title: 'Busy Professionals',
    className: 'col-span-1 md:col-span-2 lg:col-span-3',
    description:
      'Balance client meetings, project deadlines, and personal commitments without the stress of manual scheduling.',
    painPoints: [
      'Constantly overbooked',
      'Missing deadlines',
      'No time for deep work',
    ],
    solution:
      'Tuturuuu automatically balances your workload, protects focus time, and ensures you never miss a deadline again.',
    bg: 'bg-dynamic-light-purple',
    lightBg: 'bg-calendar-bg-purple',
    border: 'border-dynamic-light-purple/30',
    textColor: 'text-dynamic-purple',
  },
  {
    icon: <Users className="h-6 w-6 text-dynamic-blue" />,
    title: 'Team Leaders',
    className: 'col-span-1 md:col-span-1 lg:col-span-3',
    description:
      'Coordinate team schedules, optimize meeting times, and ensure everyone has balanced workloads.',
    painPoints: [
      'Difficult to find meeting times',
      'Team burnout',
      'Uneven workload distribution',
    ],
    solution:
      'Tuturuuu analyzes team availability, suggests optimal meeting slots, and helps distribute work evenly across your team.',
    bg: 'bg-dynamic-light-blue',
    lightBg: 'bg-calendar-bg-blue',
    border: 'border-dynamic-light-blue/30',
    textColor: 'text-dynamic-blue',
  },
  {
    icon: <GraduationCap className="h-6 w-6 text-dynamic-green" />,
    title: 'Students',
    className: 'col-span-1 md:col-span-1 lg:col-span-2',
    description:
      'Manage classes, study sessions, assignments, and social activities with intelligent scheduling.',
    painPoints: [
      'Last-minute cramming',
      'Missed assignments',
      'Poor work-life balance',
    ],
    solution:
      'Tuturuuu helps you plan ahead for assignments, allocates proper study time, and ensures you maintain a healthy balance.',
    bg: 'bg-dynamic-light-green',
    lightBg: 'bg-calendar-bg-green',
    border: 'border-dynamic-light-green/30',
    textColor: 'text-dynamic-green',
  },
  {
    icon: <Home className="h-6 w-6 text-dynamic-orange" />,
    title: 'Freelancers',
    className: 'col-span-1 md:col-span-1 lg:col-span-2',
    description:
      'Juggle multiple clients and projects while maintaining control of your schedule and work-life balance.',
    painPoints: [
      'Inconsistent workload',
      'Difficulty tracking multiple projects',
      'Client deadline conflicts',
    ],
    solution:
      'Tuturuuu helps you manage multiple clients, balance your workload, and ensure you meet all deadlines without overcommitting.',
    bg: 'bg-dynamic-light-orange',
    lightBg: 'bg-calendar-bg-orange',
    border: 'border-dynamic-light-orange/30',
    textColor: 'text-dynamic-orange',
  },
  {
    icon: <Heart className="h-6 w-6 text-dynamic-red" />,
    title: 'Parents',
    className: 'col-span-1 md:col-span-1 lg:col-span-2',
    description:
      'Balance family responsibilities, work commitments, and personal time with intelligent scheduling.',
    painPoints: [
      'Missed family events',
      'Constant overwhelm',
      'No personal time',
    ],
    solution:
      'Tuturuuu helps you prioritize family time while ensuring work commitments are met, giving you back control of your life.',
    bg: 'bg-dynamic-light-red',
    lightBg: 'bg-calendar-bg-red',
    border: 'border-dynamic-light-red/30',
    textColor: 'text-dynamic-red',
  },
];

export function UseCasesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  return (
    <section
      ref={sectionRef}
      className="relative container px-0 py-24 md:py-40"
    >
      <div className="use-cases-title-wrapper mb-16 text-center">
        <h2 className="use-cases-title mb-6 text-4xl font-bold md:text-5xl">
          <span className="bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-blue bg-clip-text text-transparent">
            Who Benefits from Tuturuuu?
          </span>
        </h2>
        <p className="mx-auto max-w-3xl text-xl leading-relaxed text-muted-foreground">
          Tuturuuu helps people from all walks of life reclaim their time and
          reduce scheduling stress
        </p>
      </div>

      <div className="use-cases-grid grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-6">
        {useCases.map((useCase, index) => (
          <div
            key={index}
            className={cn(
              'use-case-card group transform overflow-hidden rounded-xl border border-transparent bg-white/90 shadow-lg transition-all duration-300 hover:-translate-y-2 hover:border-dynamic-light-purple/20 hover:shadow-xl dark:bg-foreground/5 dark:hover:bg-foreground/10',
              useCase.className
            )}
          >
            <div className="relative p-7">
              {/* Colored accent line at top */}
              <div
                className={`absolute top-0 right-0 left-0 h-1 ${useCase.bg}`}
              ></div>

              <div
                className={`mb-6 flex h-14 w-14 items-center justify-center rounded-xl ${useCase.textColor} transition-transform duration-300 group-hover:scale-110 dark:text-white`}
              >
                {useCase.icon}
              </div>

              <h3 className="mb-3 text-2xl font-bold">{useCase.title}</h3>
              <p className="mb-6 text-muted-foreground">
                {useCase.description}
              </p>

              <div className="mb-5 rounded-lg bg-gray-50 p-4 dark:bg-foreground/5">
                <h4 className="mb-3 text-sm font-semibold text-muted-foreground">
                  Pain points
                </h4>
                <ul className="space-y-2">
                  {useCase.painPoints.map((point, i) => (
                    <li
                      key={i}
                      className={cn(
                        'pain-point flex items-center gap-2 text-sm'
                      )}
                    >
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${useCase.bg}`}
                      ></span>
                      <span className="font-medium text-dynamic-red">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div
                className={`rounded-lg border ${useCase.border} ${useCase.lightBg} p-4`}
              >
                <h4
                  className={cn(
                    'mb-2 text-sm font-semibold text-muted-foreground',
                    useCase.textColor
                  )}
                >
                  Our solution
                </h4>
                <p className={cn('text-sm', useCase.textColor)}>
                  {useCase.solution}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
