'use client';

import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import {
  ArrowRight,
  Briefcase,
  GraduationCap,
  Heart,
  Home,
  Users,
} from '@tuturuuu/ui/icons';
import { useEffect, useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

const useCases = [
  {
    icon: <Briefcase className="h-6 w-6 text-dynamic-purple" />,
    title: 'Busy Professionals',
    description:
      'Balance client meetings, project deadlines, and personal commitments without the stress of manual scheduling.',
    painPoints: [
      'Constantly overbooked',
      'Missing deadlines',
      'No time for deep work',
    ],
    solution:
      'Tuturuuu automatically balances your workload, protects focus time, and ensures you never miss a deadline again.',
    color: 'purple',
  },
  {
    icon: <Users className="h-6 w-6 text-dynamic-blue" />,
    title: 'Team Leaders',
    description:
      'Coordinate team schedules, optimize meeting times, and ensure everyone has balanced workloads.',
    painPoints: [
      'Difficult to find meeting times',
      'Team burnout',
      'Uneven workload distribution',
    ],
    solution:
      'Tuturuuu analyzes team availability, suggests optimal meeting slots, and helps distribute work evenly across your team.',
    color: 'blue',
  },
  {
    icon: <GraduationCap className="h-6 w-6 text-dynamic-green" />,
    title: 'Students',
    description:
      'Manage classes, study sessions, assignments, and social activities with intelligent scheduling.',
    painPoints: [
      'Last-minute cramming',
      'Missed assignments',
      'Poor work-life balance',
    ],
    solution:
      'Tuturuuu helps you plan ahead for assignments, allocates proper study time, and ensures you maintain a healthy balance.',
    color: 'green',
  },
  {
    icon: <Home className="h-6 w-6 text-dynamic-orange" />,
    title: 'Freelancers',
    description:
      'Juggle multiple clients and projects while maintaining control of your schedule and work-life balance.',
    painPoints: [
      'Inconsistent workload',
      'Difficulty tracking multiple projects',
      'Client deadline conflicts',
    ],
    solution:
      'Tuturuuu helps you manage multiple clients, balance your workload, and ensure you meet all deadlines without overcommitting.',
    color: 'orange',
  },
  {
    icon: <Heart className="h-6 w-6 text-dynamic-red" />,
    title: 'Parents',
    description:
      'Balance family responsibilities, work commitments, and personal time with intelligent scheduling.',
    painPoints: [
      'Missed family events',
      'Constant overwhelm',
      'No personal time',
    ],
    solution:
      'Tuturuuu helps you prioritize family time while ensuring work commitments are met, giving you back control of your life.',
    color: 'red',
  },
];

export function UseCasesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    // Title animations with split text
    gsap.from('.use-cases-title-wrapper', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.use-cases-title-wrapper',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    // Card staggered animations with scale
    const useCaseCards = gsap.utils.toArray('.use-case-card') as Element[];
    gsap.from(useCaseCards, {
      y: 60,
      opacity: 0,
      scale: 0.95,
      duration: 0.8,
      stagger: 0.1,
      ease: 'back.out(1.2)',
      scrollTrigger: {
        trigger: '.use-cases-grid',
        start: 'top bottom-=50',
      },
    });

    // Pain point animations
    useCaseCards.forEach((card) => {
      const painPoints = card.querySelectorAll('.pain-point');
      gsap.from(painPoints, {
        x: -10,
        opacity: 0,
        duration: 0.4,
        stagger: 0.1,
        scrollTrigger: {
          trigger: card,
          start: 'top bottom-=50',
        },
      });
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden py-24 md:py-40"
    >
      {/* Background gradient blobs */}
      <div className="absolute top-40 -left-40 h-96 w-96 rounded-full bg-dynamic-light-purple/15 blur-3xl filter"></div>
      <div className="absolute -right-20 -bottom-20 h-80 w-80 rounded-full bg-dynamic-light-blue/15 blur-3xl filter"></div>

      <div className="container mx-auto px-4">
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

        <div className="use-cases-grid grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {useCases.map((useCase, index) => (
            <div
              key={index}
              className="use-case-card group transform overflow-hidden rounded-xl border border-transparent bg-white/90 shadow-lg transition-all duration-300 hover:-translate-y-2 hover:border-dynamic-light-purple/20 hover:shadow-xl dark:bg-foreground/5 dark:hover:bg-foreground/10"
            >
              <div className="relative p-7">
                {/* Colored accent line at top */}
                <div
                  className={`absolute top-0 right-0 left-0 h-1 bg-dynamic-${useCase.color}`}
                ></div>

                <div
                  className={`mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-calendar-bg-${useCase.color} transition-transform duration-300 group-hover:scale-110`}
                >
                  {useCase.icon}
                </div>

                <h3 className="mb-3 text-2xl font-bold">{useCase.title}</h3>
                <p className="mb-6 text-muted-foreground">
                  {useCase.description}
                </p>

                <div className="mb-5 rounded-lg bg-gray-50 p-4 dark:bg-foreground/5">
                  <h4 className="mb-3 text-sm font-semibold text-muted-foreground">
                    PAIN POINTS
                  </h4>
                  <ul className="space-y-2">
                    {useCase.painPoints.map((point, i) => (
                      <li
                        key={i}
                        className="pain-point flex items-center gap-2 text-sm"
                      >
                        <span
                          className={`inline-block h-2 w-2 rounded-full bg-dynamic-${useCase.color}`}
                        ></span>
                        <span className="font-medium text-dynamic-red">
                          {point}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  className={`rounded-lg border border-dynamic-light-${useCase.color}/30 bg-calendar-bg-${useCase.color} p-4`}
                >
                  <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                    TUTURUUU SOLUTION
                  </h4>
                  <p
                    className={`text-sm font-medium text-dynamic-${useCase.color}`}
                  >
                    {useCase.solution}
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-end">
                  <span
                    className={`flex items-center gap-1 text-sm font-medium text-dynamic-${useCase.color} transition-all duration-300 group-hover:gap-2`}
                  >
                    Learn more <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
