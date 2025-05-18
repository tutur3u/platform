'use client';

import { gsap } from '@tuturuuu/ui/gsap';
import {
  ArrowLeftToLine,
  ArrowRight,
  Brain,
  Calendar,
  Check,
  Clock,
  Mail,
  MessageSquare,
  Video,
} from '@tuturuuu/ui/icons';
import { useEffect, useRef, useState } from 'react';

interface WorkflowStep {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  image: React.ReactNode;
}

const workflowSteps: WorkflowStep[] = [
  {
    id: 1,
    title: 'Create Tasks Naturally',
    description:
      "Type or speak in natural language to create tasks. Tuturuuu's AI understands context, deadlines, and priorities.",
    icon: <MessageSquare className="h-6 w-6 text-white" />,
    color: 'bg-purple-500',
    image: (
      <div className="rounded-lg border bg-white p-4 shadow-md dark:bg-foreground/5">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple">
            <MessageSquare className="h-4 w-4 text-dynamic-purple" />
          </div>
          <div>
            <h4 className="text-sm font-medium">Natural Language Input</h4>
          </div>
        </div>
        <div className="rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-3 text-sm">
          "Schedule a meeting with the marketing team next Tuesday at 10am, high
          priority"
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-dynamic-light-green/30 bg-calendar-bg-green">
            <Check className="h-3 w-3 text-dynamic-green" />
          </div>
          <span className="text-xs text-dynamic-green">
            Task created and scheduled
          </span>
        </div>
      </div>
    ),
  },
  {
    id: 2,
    title: 'AI Analyzes & Optimizes',
    description:
      'Our AI analyzes your tasks, priorities, deadlines, and team availability to create the optimal schedule.',
    icon: <Brain className="h-6 w-6 text-white" />,
    color: 'bg-blue-500',
    image: (
      <div className="rounded-lg border bg-white p-4 shadow-md dark:bg-foreground/5">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-blue/30 bg-calendar-bg-blue">
            <Brain className="h-4 w-4 text-dynamic-blue" />
          </div>
          <div>
            <h4 className="text-sm font-medium">AI Analysis</h4>
          </div>
        </div>
        <div className="space-y-2">
          <div className="rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-dynamic-blue">
                Priority Analysis
              </span>
              <span className="rounded bg-calendar-bg-red px-1.5 text-xs text-dynamic-red">
                High
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-dynamic-blue">
                Team Availability
              </span>
              <span className="rounded bg-calendar-bg-green px-1.5 text-xs text-dynamic-green">
                All Available
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-dynamic-blue">
                Optimal Time Slot
              </span>
              <span className="text-xs text-dynamic-blue">
                Tuesday, 10:00 AM
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 3,
    title: 'Everything in One Place',
    description:
      'Calendar events, tasks, meetings, chat, and email all work together in a unified workspace.',
    icon: <Calendar className="h-6 w-6 text-white" />,
    color: 'bg-green-500',
    image: (
      <div className="rounded-lg border bg-white p-4 shadow-md dark:bg-foreground/5">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-green/30 bg-calendar-bg-green">
            <Calendar className="h-4 w-4 text-dynamic-green" />
          </div>
          <div>
            <h4 className="text-sm font-medium">Unified Workspace</h4>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-2">
            <Calendar className="h-3 w-3 text-dynamic-purple" />
            <span className="text-xs text-dynamic-purple">Calendar</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-2">
            <Check className="h-3 w-3 text-dynamic-blue" />
            <span className="text-xs text-dynamic-blue">Tasks</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-2">
            <Video className="h-3 w-3 text-dynamic-green" />
            <span className="text-xs text-dynamic-green">Meetings</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-dynamic-light-orange/30 bg-calendar-bg-orange p-2">
            <MessageSquare className="h-3 w-3 text-dynamic-orange" />
            <span className="text-xs text-dynamic-orange">Chat</span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-2">
          <Mail className="h-3 w-3 text-dynamic-red" />
          <span className="text-xs text-dynamic-red">Email</span>
        </div>
      </div>
    ),
  },
  {
    id: 4,
    title: 'Continuous Improvement',
    description:
      'Tuturuuu learns from your habits and preferences to get better over time, making you more productive every day.',
    icon: <Clock className="h-6 w-6 text-white" />,
    color: 'bg-amber-500',
    image: (
      <div className="rounded-lg border bg-white p-4 shadow-md dark:bg-foreground/5">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-orange/30 bg-calendar-bg-orange">
            <Clock className="h-4 w-4 text-dynamic-orange" />
          </div>
          <div>
            <h4 className="text-sm font-medium">Learning & Adaptation</h4>
          </div>
        </div>
        <div className="space-y-2">
          <div className="rounded-lg border border-dynamic-light-orange/30 bg-calendar-bg-orange p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-dynamic-orange">
                Productivity Pattern
              </span>
              <span className="text-xs text-dynamic-orange">Morning Focus</span>
            </div>
          </div>
          <div className="rounded-lg border border-dynamic-light-orange/30 bg-calendar-bg-orange p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-dynamic-orange">
                Meeting Preference
              </span>
              <span className="text-xs text-dynamic-orange">Afternoons</span>
            </div>
          </div>
          <div className="rounded-lg border border-dynamic-light-orange/30 bg-calendar-bg-orange p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-dynamic-orange">
                Task Completion Rate
              </span>
              <span className="rounded bg-calendar-bg-green px-1.5 text-xs text-dynamic-green">
                92%
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

export function WorkflowSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeStep, setActiveStep] = useState(1);

  useEffect(() => {
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
      gsap.from('.workflow-title', {
        y: 50,
        opacity: 0,
        duration: 0.8,
        scrollTrigger: {
          trigger: '.workflow-title',
          start: 'top bottom-=100',
          toggleActions: 'play none none none',
        },
      });

      const workflowItems = gsap.utils.toArray('.workflow-item') as Element[];

      // Initial animation for the first active step's image/content
      // This assumes the first step is active on load and its content is present.
      if (workflowItems.length > 0) {
        gsap.from(workflowItems[0]!, {
          y: 50,
          opacity: 0,
          duration: 0.8,
          scrollTrigger: {
            trigger: workflowItems[0],
            start: 'top bottom-=100',
            toggleActions: 'play none none none',
          },
        });
      }
    }, sectionRef); // Scope GSAP context to the sectionRef

    return () => {
      ctx.revert(); // Cleanup GSAP animations and ScrollTriggers
    };
  }, []); // Initial animation runs once on mount

  useEffect(() => {
    // Handle animations when activeStep changes
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
      const workflowItemContent = sectionRef.current?.querySelector(
        '.workflow-item-content'
      ); // Add a class to the content that changes
      if (workflowItemContent) {
        gsap.fromTo(
          workflowItemContent,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
        );
      }
    }, sectionRef);

    return () => {
      ctx.revert();
    };
  }, [activeStep]); // Re-run when activeStep changes

  const currentStep = (workflowSteps.find((step) => step.id === activeStep) ||
    workflowSteps[0]) as WorkflowStep;

  return (
    <section id="workflow" ref={sectionRef} className="pt-40 pb-20">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="workflow-title mb-4 text-3xl font-bold md:text-4xl">
            <span className="bg-gradient-to-r from-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
              How Tuturuuu Works
            </span>
          </h2>
          <p className="workflow-title mx-auto max-w-3xl text-xl text-muted-foreground">
            Our intelligent workflow makes productivity effortless
          </p>
        </div>

        <div className="mb-12 flex flex-wrap justify-center gap-4">
          {workflowSteps.map((step) => (
            <button
              key={step.id}
              className={`workflow-step-button flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeStep === step.id
                  ? `${step.color} text-white shadow-md`
                  : 'border bg-transparent'
              }`}
              onClick={() => setActiveStep(step.id)}
            >
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  activeStep === step.id ? 'bg-white/20' : 'bg-gray-100'
                }`}
              >
                <span
                  className={
                    activeStep === step.id ? 'text-white' : 'text-gray-700'
                  }
                >
                  {step.id}
                </span>
              </div>
              {step.title}
            </button>
          ))}
        </div>

        <div className="workflow-item grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          {/* This div will be animated on activeStep change */}
          <div className="workflow-item-content">
            <div
              className={`inline-block rounded-lg p-2 ${currentStep.color} mb-4`}
            >
              {currentStep.icon}
            </div>
            <h3 className="mb-3 text-2xl font-bold">{currentStep.title}</h3>
            <p className="mb-6 text-lg text-muted-foreground">
              {currentStep.description}
            </p>

            <div className="mb-8 flex items-center gap-2">
              {workflowSteps.map((step) => (
                <button
                  key={step.id}
                  className={`h-3 w-3 rounded-full transition-colors ${
                    activeStep === step.id
                      ? currentStep.color
                      : 'bg-foreground/20'
                  }`}
                  onClick={() => setActiveStep(step.id)}
                  aria-label={`Step ${step.id}`}
                ></button>
              ))}
            </div>

            <button
              className={`${currentStep.color} flex items-center gap-2 rounded-md px-4 py-2 text-white hover:opacity-90`}
              onClick={() => setActiveStep(activeStep < 4 ? activeStep + 1 : 1)}
            >
              {activeStep < 4 ? 'Next Step' : 'Start Over'}{' '}
              {activeStep < 4 ? (
                <ArrowRight className="h-4 w-4" />
              ) : (
                <ArrowLeftToLine className="h-4 w-4" />
              )}
            </button>
          </div>
          {/* This div will be animated on activeStep change */}
          <div className="workflow-item-content">{currentStep.image}</div>
        </div>
      </div>
    </section>
  );
}
