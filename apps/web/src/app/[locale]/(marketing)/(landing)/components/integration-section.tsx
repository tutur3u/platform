'use client';

import { Button } from '@tuturuuu/ui/button';
import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import {
  ArrowRight,
  Calendar,
  Check,
  Mail,
  MessageSquare,
  Video,
} from '@tuturuuu/ui/icons';
import { useEffect, useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

export function IntegrationSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    gsap.from('.integration-title', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.integration-title',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    gsap.from('.integration-image', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.integration-image',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return (
    <section ref={sectionRef} className="pt-20">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="integration-title mb-4 text-3xl font-bold md:text-4xl">
            <span className="from-dynamic-purple to-dynamic-blue bg-gradient-to-r bg-clip-text text-transparent">
              Seamless Integration
            </span>
          </h2>
          <p className="integration-title text-muted-foreground mx-auto max-w-3xl text-xl">
            TuPlan brings all your productivity tools together in one unified
            workspace
          </p>
        </div>

        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <h3 className="mb-6 text-2xl font-bold">
              Everything Works Together
            </h3>
            <p className="text-muted-foreground mb-8 text-lg">
              No more switching between apps or losing context. TuPlan
              integrates your calendar, tasks, meetings, chat, and email in one
              intelligent workspace.
            </p>

            <div className="mb-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="bg-calendar-bg-purple flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                  <Calendar className="text-dynamic-purple h-6 w-6" />
                </div>
                <div>
                  <h4 className="mb-1 text-lg font-semibold">
                    Calendar + Tasks
                  </h4>
                  <p className="text-muted-foreground">
                    Tasks automatically appear in your calendar, scheduled at
                    the optimal time based on priority and deadline.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="bg-calendar-bg-blue flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                  <Video className="text-dynamic-blue h-6 w-6" />
                </div>
                <div>
                  <h4 className="mb-1 text-lg font-semibold">
                    Meetings + Chat
                  </h4>
                  <p className="text-muted-foreground">
                    Tuturuuu meetings integrate with chat for pre-meeting
                    discussions and post-meeting follow-ups.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="bg-calendar-bg-green flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                  <Mail className="text-dynamic-green h-6 w-6" />
                </div>
                <div>
                  <h4 className="mb-1 text-lg font-semibold">
                    Email + Calendar
                  </h4>
                  <p className="text-muted-foreground">
                    Emails can be converted to calendar events or tasks with a
                    single click.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="bg-calendar-bg-orange flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                  <MessageSquare className="text-dynamic-orange h-6 w-6" />
                </div>
                <div>
                  <h4 className="mb-1 text-lg font-semibold">Chat + Tasks</h4>
                  <p className="text-muted-foreground">
                    Create and assign tasks directly from chat conversations,
                    keeping everything in context.
                  </p>
                </div>
              </div>
            </div>

            <Button className="from-dynamic-light-purple to-dynamic-light-blue flex items-center gap-2 bg-gradient-to-r text-white hover:opacity-90">
              See how it works <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="integration-image">
            <div className="relative">
              <div className="bg-calendar-bg-purple absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-3xl filter"></div>
              <div className="bg-calendar-bg-blue absolute -bottom-10 -left-10 h-40 w-40 rounded-full opacity-20 blur-3xl filter"></div>

              <div className="dark:bg-foreground/5 relative overflow-hidden rounded-xl border bg-white shadow-xl">
                <div className="from-dynamic-purple to-dynamic-blue bg-gradient-to-r p-3 text-white">
                  <h3 className="font-medium">Unified Workspace</h3>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Calendar className="text-dynamic-purple h-4 w-4" />
                        <h4 className="text-dynamic-purple text-sm font-medium">
                          Calendar
                        </h4>
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: 7 }).map((_, i) => (
                          <div
                            key={i}
                            className="bg-calendar-bg-purple text-dynamic-purple flex aspect-square items-center justify-center rounded-sm text-xs"
                          >
                            {i + 1}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue rounded-lg border p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Check className="text-dynamic-blue h-4 w-4" />
                        <h4 className="text-dynamic-blue text-sm font-medium">
                          Tasks
                        </h4>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <div className="border-dynamic-blue h-3 w-3 rounded-full border"></div>
                          <span className="text-dynamic-blue truncate text-xs">
                            Finalize report
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="border-dynamic-blue h-3 w-3 rounded-full border"></div>
                          <span className="text-dynamic-blue truncate text-xs">
                            Review design
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-dynamic-light-green/30 bg-calendar-bg-green rounded-lg border p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Video className="text-dynamic-green h-4 w-4" />
                        <h4 className="text-dynamic-green text-sm font-medium">
                          Meetings
                        </h4>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="bg-calendar-bg-green flex h-5 w-5 items-center justify-center rounded-full text-[10px]">
                          A
                        </div>
                        <div className="bg-calendar-bg-green flex h-5 w-5 items-center justify-center rounded-full text-[10px]">
                          B
                        </div>
                        <span className="text-dynamic-green text-xs">
                          Team Sync
                        </span>
                      </div>
                    </div>

                    <div className="border-dynamic-light-orange/30 bg-calendar-bg-orange rounded-lg border p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <MessageSquare className="text-dynamic-orange h-4 w-4" />
                        <h4 className="text-dynamic-orange text-sm font-medium">
                          Chat
                        </h4>
                      </div>
                      <div className="text-dynamic-orange dark:bg-foreground/5 rounded bg-white p-1 text-[10px]">
                        Latest updates on project...
                      </div>
                    </div>
                  </div>

                  <div className="border-dynamic-light-red/30 bg-calendar-bg-red mt-3 rounded-lg border p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Mail className="text-dynamic-red h-4 w-4" />
                      <h4 className="text-dynamic-red text-sm font-medium">
                        Email
                      </h4>
                    </div>
                    <div className="text-dynamic-red dark:bg-foreground/5 rounded bg-white p-1 text-[10px]">
                      2 new messages from clients...
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
