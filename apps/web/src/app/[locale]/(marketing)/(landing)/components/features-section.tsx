'use client';

import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import {
  ArrowRight,
  Calendar,
  Check,
  Mail,
  MessageSquare,
  Mic,
  Phone,
  Share,
  Video,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef, useState } from 'react';

gsap.registerPlugin(ScrollTrigger);

interface Feature {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  details: string[];
  image: React.ReactNode;
}

const features: Feature[] = [
  {
    id: 'calendar',
    name: 'TuPlan',
    icon: <Calendar className="h-8 w-8" />,
    color: 'from-dynamic-light-purple to-[purple]',
    description:
      'AI-powered scheduling that learns your preferences and optimizes your calendar automatically.',
    details: [
      'Intelligent scheduling based on priorities and deadlines',
      'Focus time protection during your peak productivity hours',
      'Automatic rescheduling when conflicts arise',
      'Team availability matching for optimal meeting times',
      'Natural language input for quick event creation',
    ],
    image: (
      <div className="rounded-lg border bg-white p-4 shadow-lg dark:bg-foreground/5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-foreground">May 2025</h3>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-dynamic-light-orange/30 bg-calendar-bg-orange px-3 py-1 text-xs font-medium text-dynamic-orange">
              Month
            </span>
            <span className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
              Week
            </span>
          </div>
        </div>
        <div className="mb-2 grid grid-cols-7 gap-1">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
            <div
              key={i}
              className="text-center text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 font-semibold">
          {Array.from({ length: 35 }).map((_, i) => {
            const isToday = i === 15;
            const hasMeeting = [3, 8, 10, 15, 16, 22, 27].includes(i);
            const hasFocus = [4, 11, 18, 25].includes(i);
            const hasTask = [2, 7, 9, 14, 17, 21, 28].includes(i);

            return (
              <div
                key={i}
                className={`flex aspect-square items-center justify-center rounded-sm border ${
                  isToday
                    ? 'border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-purple'
                    : hasMeeting
                      ? 'border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue'
                      : hasFocus
                        ? 'border-dynamic-light-green/30 bg-calendar-bg-green text-dynamic-green'
                        : hasTask
                          ? 'border-dynamic-light-orange/30 bg-calendar-bg-orange text-dynamic-orange'
                          : 'bg-white dark:bg-foreground/5'
                }`}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
      </div>
    ),
  },
  {
    id: 'tasks',
    name: 'TuDo',
    icon: <Check className="h-8 w-8" />,
    color: 'from-dynamic-light-blue to-[blue]',
    description:
      'Seamlessly integrated task management that prioritizes your work and schedules it intelligently.',
    details: [
      'Automatic task prioritization based on deadlines and importance',
      'Workload balancing to prevent overcommitment',
      'Smart scheduling of tasks in your calendar',
      'Progress tracking and completion statistics',
      'Team task assignment and collaboration',
    ],
    image: (
      <div className="rounded-lg border bg-white p-4 shadow-lg dark:bg-foreground/5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-foreground">My Tasks</h3>
          <span className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
            Add Task
          </span>
        </div>
        <div className="space-y-2">
          {[
            {
              name: 'Finalize Q2 report',
              priority: 'High',
              due: 'Today',
              complete: false,
            },
            {
              name: 'Review design mockups',
              priority: 'Medium',
              due: 'Tomorrow',
              complete: false,
            },
            {
              name: 'Team meeting preparation',
              priority: 'Medium',
              due: 'May 18',
              complete: false,
            },
            {
              name: 'Update client presentation',
              priority: 'Low',
              due: 'May 20',
              complete: false,
            },
            {
              name: 'Research competitors',
              priority: 'Low',
              due: 'May 22',
              complete: true,
            },
          ].map((task, i) => (
            <div
              key={i}
              className={`border p-2 ${
                task.complete
                  ? 'bg-dynamic-purple/20'
                  : task.priority === 'High'
                    ? 'border-2 border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-red'
                    : task.priority === 'Medium'
                      ? 'border-2 border-dynamic-light-orange/30 bg-calendar-bg-orange text-dynamic-orange'
                      : 'border-2 border-dynamic-light-green/30 bg-calendar-bg-green text-dynamic-green'
              } flex items-start gap-2 rounded-md`}
            >
              <div
                className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded-full ${
                  task.complete
                    ? 'bg-dynamic-purple/20'
                    : task.priority === 'High'
                      ? 'border-2 border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-red'
                      : task.priority === 'Medium'
                        ? 'border-2 border-dynamic-light-orange/30 bg-calendar-bg-orange text-dynamic-orange'
                        : 'border-2 border-dynamic-light-green/30 bg-calendar-bg-green text-dynamic-green'
                }`}
              >
                {task.complete && (
                  <Check className="h-3 w-3 text-dynamic-purple" />
                )}
              </div>
              <div className="flex-1">
                <p
                  className={`text-xs font-medium ${task.complete ? 'text-dynamic-purple line-through' : ''}`}
                >
                  {task.name}
                </p>
                <div className="mt-1 flex items-center gap-1">
                  <span
                    className={`rounded px-1 py-0.5 text-[10px] ${
                      task.priority === 'High'
                        ? 'bg-dynamic-light-red/30 text-dynamic-red'
                        : task.priority === 'Medium'
                          ? 'bg-dynamic-light-orange/30 text-dynamic-orange'
                          : 'bg-dynamic-light-green/30 text-dynamic-green'
                    }`}
                  >
                    {task.priority}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Due: {task.due}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'meetings',
    name: 'TuMeet',
    icon: <Video className="h-8 w-8" />,
    color: 'from-dynamic-light-green to-[green]',
    description:
      'Integrated video conferencing with AI-powered features to make your meetings more productive.',
    details: [
      'One-click meeting creation from calendar events',
      'AI-generated meeting notes and action items',
      'Real-time transcription and translation',
      'Smart follow-ups and task creation',
      'Meeting analytics and insights',
    ],
    image: (
      <div className="rounded-lg border bg-white p-4 shadow-lg dark:bg-foreground/5">
        <div className="-mx-4 -mt-4 mb-4 flex items-center justify-between rounded-t-lg border-b bg-calendar-bg-green px-4 py-2 text-foreground">
          <div className="flex items-center gap-2 text-dynamic-green">
            <Video className="h-6 w-6" />
            <span className="font-medium">Team Sync Meeting</span>
          </div>
          <span className="rounded-md border border-dynamic-light-green/30 bg-calendar-bg-green px-3 py-1 text-xs font-medium text-dynamic-green">
            Live
          </span>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 font-semibold text-white">
          <div className="flex aspect-video items-center justify-center rounded-md border border-dynamic-light-green/30 bg-calendar-bg-green">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-light-green/70 text-sm">
              A
            </div>
          </div>
          <div className="flex aspect-video items-center justify-center rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-light-blue/70 text-sm">
              B
            </div>
          </div>
          <div className="flex aspect-video items-center justify-center rounded-md border border-dynamic-light-red/30 bg-calendar-bg-red">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-light-red/70 text-sm">
              C
            </div>
          </div>
          <div className="flex aspect-video items-center justify-center rounded-md border border-dynamic-light-orange/30 bg-calendar-bg-orange">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-light-orange/70 text-sm">
              D
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-red/30 bg-calendar-bg-red">
            <Phone className="h-4 w-4 text-dynamic-red" />
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-blue/30 bg-calendar-bg-blue">
            <Video className="h-4 w-4 text-dynamic-blue" />
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-green/30 bg-calendar-bg-green">
            <Mic className="h-4 w-4 text-dynamic-green" />
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-orange/30 bg-calendar-bg-orange">
            <Share className="h-4 w-4 text-dynamic-orange" />
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'chat',
    name: 'TuChat',
    icon: <MessageSquare className="h-8 w-8" />,
    color: 'from-dynamic-light-orange to-[orange]',
    description:
      'Built-in team chat that integrates seamlessly with your calendar, tasks, and meetings.',
    details: [
      'Real-time messaging with team members',
      'Direct integration with calendar events and tasks',
      'File sharing and collaboration',
      'AI-powered chat summaries and highlights',
      'Smart notifications and reminders',
    ],
    image: (
      <div className="rounded-lg border bg-white p-4 shadow-lg dark:bg-foreground/5">
        <div className="mb-3 flex items-center gap-2 border-b pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-light-orange/30">
            <span className="text-xs font-medium text-dynamic-orange">MP</span>
          </div>
          <div>
            <h4 className="text-sm font-medium">Marketing Project</h4>
            <p className="text-xs text-muted-foreground">
              5 members • 3 online
            </p>
          </div>
        </div>
        <div className="mb-3 space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-dynamic-light-green/30">
              <span className="text-[10px] font-medium">A</span>
            </div>
            <div className="max-w-[80%] rounded-lg bg-dynamic-light-green/30 p-1.5 text-xs">
              <p className="text-[10px] font-medium text-muted-foreground">
                Alex
              </p>
              <p>Has everyone reviewed the latest campaign mockups?</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                10:15 AM
              </p>
            </div>
          </div>
          <div className="flex items-start justify-end gap-2">
            <div className="max-w-[80%] rounded-lg bg-dynamic-light-orange/30 p-1.5 text-xs">
              <p className="text-[10px] font-medium text-dynamic-orange">You</p>
              <p>Yes, I've added my comments in the shared document.</p>
              <p className="mt-0.5 text-[10px] text-dynamic-orange">10:17 AM</p>
            </div>
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-dynamic-light-orange/30">
              <span className="text-[10px] font-medium">Y</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="text"
            placeholder="Type a message..."
            className="flex-1 rounded-md border border-dynamic-light-orange/30 px-2 py-1 text-xs focus:outline-none"
          />
          <button className="flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-light-orange/30">
            <ArrowRight className="h-3 w-3 text-dynamic-orange" />
          </button>
        </div>
      </div>
    ),
  },
  {
    id: 'mail',
    name: 'TuMail',
    icon: <Mail className="h-8 w-8" />,
    color: 'from-dynamic-light-red to-[red]',
    description:
      'Intelligent email management that integrates with your calendar and tasks for seamless productivity.',
    details: [
      'AI-powered email categorization and prioritization',
      'Smart replies and follow-up suggestions',
      'Automatic task creation from emails',
      'Meeting scheduling directly from emails',
      'Email analytics and insights',
    ],
    image: (
      <div className="rounded-lg border bg-white p-4 shadow-lg dark:bg-foreground/5">
        <div className="mb-3 flex items-center justify-between border-b pb-2">
          <h3 className="text-sm font-medium">Inbox</h3>
          <span className="rounded bg-dynamic-light-red/30 px-1.5 py-0.5 text-xs text-dynamic-red">
            3 New
          </span>
        </div>
        <div className="space-y-2">
          {[
            {
              sender: 'Alex Chen',
              subject: 'Project Update',
              time: '10:30 AM',
              color:
                'border border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-red',
            },
            {
              sender: 'Sarah Thompson',
              subject: 'Client feedback',
              time: 'Yesterday',
              color:
                'border border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue',
            },
            {
              sender: 'John Doe',
              subject: 'Meeting follow-up',
              time: 'May 12',
              color:
                'border border-dynamic-light-green/30 bg-calendar-bg-green text-dynamic-green',
            },
            {
              sender: 'Marketing Team',
              subject: 'Weekly newsletter',
              time: 'May 10',
              color:
                'border border-dynamic-light-orange/30 bg-calendar-bg-orange text-dynamic-orange',
            },
          ].map((email, i) => (
            <div key={i} className={cn('rounded-md p-2', email.color)}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{email.sender}</span>
                <span className="text-[10px] text-muted-foreground">
                  {email.time}
                </span>
              </div>
              <p className="text-xs font-medium">{email.subject}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

export function FeaturesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeFeature, setActiveFeature] = useState('calendar');

  useEffect(() => {
    if (!sectionRef.current) return;

    gsap.from('.features-title', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.features-title',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    const featureCards = gsap.utils.toArray('.feature-card') as Element[];

    featureCards.forEach((card, index) => {
      gsap.from(card, {
        y: 50,
        opacity: 0,
        duration: 0.8,
        scrollTrigger: {
          trigger: card as Element,
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

  const currentFeature = (features.find((f) => f.id === activeFeature) ||
    features[0]) as Feature;

  return (
    <section
      id="features"
      ref={sectionRef}
      className="container w-full px-0 pt-40 pb-20"
    >
      <div className="mb-16 text-center">
        <h2 className="features-title mb-4 text-3xl font-bold md:text-4xl">
          <span className="bg-gradient-to-r from-dynamic-light-blue to-dynamic-light-purple bg-clip-text text-transparent">
            One Platform, Complete Productivity
          </span>
        </h2>
        <p className="features-title mx-auto max-w-3xl text-xl text-muted-foreground">
          TuPlan unifies all your productivity tools in one intelligent
          workspace.
        </p>
      </div>

      <div className="mb-12 flex flex-wrap justify-center gap-4">
        {features.map((feature) => (
          <button
            key={feature.id}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              activeFeature === feature.id
                ? `bg-gradient-to-br ${feature.color} text-white shadow-md`
                : 'bg-transparent text-muted-foreground hover:bg-white dark:bg-foreground/5'
            }`}
            onClick={() => setActiveFeature(feature.id)}
          >
            <div
              className={`${activeFeature !== feature.id ? 'text-muted-foreground' : 'text-white'}`}
            >
              {feature.icon}
            </div>
            {feature.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <div>
            <div
              className={`inline-block rounded-lg bg-gradient-to-br p-2 ${currentFeature.color} mb-4 text-white`}
            >
              {currentFeature.icon}
            </div>
            <h3 className="mb-3 text-2xl font-bold">{currentFeature.name}</h3>
            <p className="mb-6 text-lg text-foreground/80">
              {currentFeature.description}
            </p>

            <ul className="mb-8 space-y-3">
              {currentFeature.details.map((detail, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div
                    className={`h-6 w-6 rounded-full bg-gradient-to-br ${currentFeature.color} mt-0.5 flex flex-shrink-0 items-center justify-center`}
                  >
                    <Check className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-muted-foreground">{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="feature-card order-1 lg:order-2">
          <div className="relative">
            <div className="absolute top-0 right-0 -mt-20 -mr-20 h-40 w-40 rounded-full bg-gradient-to-br from-purple-200 to-blue-200 opacity-20 blur-3xl filter"></div>
            <div className="relative">{currentFeature.image}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
