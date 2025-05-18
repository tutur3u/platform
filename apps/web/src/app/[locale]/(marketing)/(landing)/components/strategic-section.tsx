'use client';

import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import {
  Brain,
  Calendar,
  Check,
  Clock,
  MessageSquare,
  Video,
  Zap,
} from '@tuturuuu/ui/icons';
import { useEffect, useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

export function StrategicSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    gsap.from('.strategic-title', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.strategic-title',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    gsap.from('.strategic-card', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      stagger: 0.1,
      scrollTrigger: {
        trigger: '.strategic-card',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return (
    <section ref={sectionRef} className="container w-full px-0 pt-20">
      <div className="mb-16 text-center">
        <h2 className="strategic-title mb-4 text-3xl font-bold md:text-4xl">
          <span className="from-dynamic-light-purple/80 to-dynamic-light-blue/80 bg-gradient-to-r bg-clip-text text-transparent">
            Strategic Advantages
          </span>
        </h2>
        <p className="strategic-title text-muted-foreground mx-auto max-w-3xl text-xl">
          Why Tuturuuu is a game-changer for your productivity
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-purple/80 to-dynamic-light-blue/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">Unified Workspace</h3>
          <p className="text-muted-foreground mb-4">
            Stop switching between apps and losing context. Tuturuuu brings your
            calendar, tasks, meetings, chat, and email into one intelligent
            workspace.
          </p>
          <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-4">
            <h4 className="text-dynamic-purple mb-2 font-medium">
              Strategic Impact:
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Reduce context switching by 70%</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Save 5+ hours weekly on app switching</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Maintain complete workflow visibility</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-blue/80 to-dynamic-light-blue/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">AI-Powered Intelligence</h3>
          <p className="text-muted-foreground mb-4">
            Tuturuuu's advanced AI understands your priorities, deadlines, and
            preferences to optimize your schedule automatically.
          </p>
          <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue rounded-lg border p-4">
            <h4 className="text-dynamic-blue mb-2 font-medium">
              Strategic Impact:
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Reduce scheduling time by 85%</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Ensure high-priority work gets done</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Prevent burnout through workload balancing</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-green/80 to-dynamic-light-green/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <Clock className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">Focus Time Protection</h3>
          <p className="text-muted-foreground mb-4">
            Tuturuuu automatically blocks out time for deep work based on your
            productivity patterns, ensuring you have uninterrupted time for
            meaningful work.
          </p>
          <div className="border-dynamic-light-green/30 bg-calendar-bg-green rounded-lg border p-4">
            <h4 className="text-dynamic-green mb-2 font-medium">
              Strategic Impact:
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Gain 10+ hours of deep work weekly</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Increase quality of work output</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Reduce stress from constant interruptions</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-orange/80 to-dynamic-light-orange/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <Video className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">Enhanced Meetings</h3>
          <p className="text-muted-foreground mb-4">
            Tuturuuu meetings go beyond video conferencing with AI-generated
            notes, automatic task creation, and smart follow-ups.
          </p>
          <div className="border-dynamic-light-orange/30 bg-calendar-bg-orange rounded-lg border p-4">
            <h4 className="text-dynamic-orange mb-2 font-medium">
              Strategic Impact:
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Eliminate manual note-taking</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Ensure 100% follow-through on action items</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Reduce meeting time by 30%</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-red/80 to-dynamic-light-red/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <MessageSquare className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">Productive Communication</h3>
          <p className="text-muted-foreground mb-4">
            Tuturuuu's chat and email systems are designed for productivity,
            with task creation, meeting scheduling, and AI-powered summaries.
          </p>
          <div className="border-dynamic-light-red/30 bg-calendar-bg-red rounded-lg border p-4">
            <h4 className="text-dynamic-red mb-2 font-medium">
              Strategic Impact:
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Reduce email processing time by 60%</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Never miss important messages or action items</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Streamline team communication and collaboration</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-purple/80 to-dynamic-light-blue/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <Calendar className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">Continuous Improvement</h3>
          <p className="text-muted-foreground mb-4">
            Tuturuuu learns from your habits and preferences over time, getting
            smarter and more personalized to make you increasingly productive.
          </p>
          <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-4">
            <h4 className="text-dynamic-purple mb-2 font-medium">
              Strategic Impact:
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Productivity increases month over month</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Personalized experience based on your work style</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>Ongoing ROI as the system gets smarter</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
