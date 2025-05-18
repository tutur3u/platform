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
            <span className="bg-gradient-to-r from-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
              Seamless Integration
            </span>
          </h2>
          <p className="integration-title mx-auto max-w-3xl text-xl text-muted-foreground">
            TuPlan brings all your productivity tools together in one unified
            workspace
          </p>
        </div>

        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <h3 className="mb-6 text-2xl font-bold">
              Everything Works Together
            </h3>
            <p className="mb-8 text-lg text-muted-foreground">
              No more switching between apps or losing context. TuPlan
              integrates your calendar, tasks, meetings, chat, and email in one
              intelligent workspace.
            </p>

            <div className="mb-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-calendar-bg-purple">
                  <Calendar className="h-6 w-6 text-dynamic-purple" />
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
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-calendar-bg-blue">
                  <Video className="h-6 w-6 text-dynamic-blue" />
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
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-calendar-bg-green">
                  <Mail className="h-6 w-6 text-dynamic-green" />
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
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-calendar-bg-orange">
                  <MessageSquare className="h-6 w-6 text-dynamic-orange" />
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

            <Button className="flex items-center gap-2 bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-blue text-white hover:opacity-90">
              See how it works <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="integration-image">
            <div className="relative">
              <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-calendar-bg-purple opacity-20 blur-3xl filter"></div>
              <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-calendar-bg-blue opacity-20 blur-3xl filter"></div>

              <div className="relative overflow-hidden rounded-xl border bg-white shadow-xl dark:bg-foreground/5">
                <div className="bg-gradient-to-r from-dynamic-purple to-dynamic-blue p-3 text-white">
                  <h3 className="font-medium">Unified Workspace</h3>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-dynamic-purple" />
                        <h4 className="text-sm font-medium text-dynamic-purple">
                          Calendar
                        </h4>
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: 7 }).map((_, i) => (
                          <div
                            key={i}
                            className="flex aspect-square items-center justify-center rounded-sm bg-calendar-bg-purple text-xs text-dynamic-purple"
                          >
                            {i + 1}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Check className="h-4 w-4 text-dynamic-blue" />
                        <h4 className="text-sm font-medium text-dynamic-blue">
                          Tasks
                        </h4>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <div className="h-3 w-3 rounded-full border border-dynamic-blue"></div>
                          <span className="truncate text-xs text-dynamic-blue">
                            Finalize report
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="h-3 w-3 rounded-full border border-dynamic-blue"></div>
                          <span className="truncate text-xs text-dynamic-blue">
                            Review design
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Video className="h-4 w-4 text-dynamic-green" />
                        <h4 className="text-sm font-medium text-dynamic-green">
                          Meetings
                        </h4>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-calendar-bg-green text-[10px]">
                          A
                        </div>
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-calendar-bg-green text-[10px]">
                          B
                        </div>
                        <span className="text-xs text-dynamic-green">
                          Team Sync
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-dynamic-light-orange/30 bg-calendar-bg-orange p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-dynamic-orange" />
                        <h4 className="text-sm font-medium text-dynamic-orange">
                          Chat
                        </h4>
                      </div>
                      <div className="rounded bg-white p-1 text-[10px] text-dynamic-orange dark:bg-foreground/5">
                        Latest updates on project...
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-dynamic-red" />
                      <h4 className="text-sm font-medium text-dynamic-red">
                        Email
                      </h4>
                    </div>
                    <div className="rounded bg-white p-1 text-[10px] text-dynamic-red dark:bg-foreground/5">
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
