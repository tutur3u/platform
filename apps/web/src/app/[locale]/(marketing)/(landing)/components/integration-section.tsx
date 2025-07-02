'use client';

import { gsap } from '@tuturuuu/ui/gsap';
import {
  Calendar,
  Check,
  Mail,
  MessageSquare,
  Video,
} from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

export function IntegrationSection() {
  const t = useTranslations('landing');

  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
      const integrationTitleElements =
        sectionRef.current?.querySelectorAll('.integration-title');
      if (integrationTitleElements && integrationTitleElements.length > 0) {
        gsap.from(integrationTitleElements, {
          y: 50,
          opacity: 0,
          duration: 0.8,
          scrollTrigger: {
            trigger: integrationTitleElements[0],
            start: 'top bottom-=100',
            toggleActions: 'play none none none',
          },
        });
      }

      const integrationImageElement =
        sectionRef.current?.querySelector('.integration-image');
      if (integrationImageElement) {
        gsap.from(integrationImageElement, {
          y: 50,
          opacity: 0,
          duration: 0.8,
          scrollTrigger: {
            trigger: integrationImageElement,
            start: 'top bottom-=100',
            toggleActions: 'play none none none',
          },
        });
      }
    }, sectionRef); // Scope GSAP context to the sectionRef

    return () => {
      ctx.revert(); // Cleanup GSAP animations and ScrollTriggers
    };
  }, []); // Empty dependency array to run once on mount

  return (
    <section ref={sectionRef} className="container px-0 pt-20">
      <div className="mb-16 text-center">
        <h2 className="integration-title mb-4 text-3xl font-bold md:text-4xl">
          <span className="bg-gradient-to-r from-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
            {t('seamless_integration')}
          </span>
        </h2>
        <p className="integration-title mx-auto max-w-3xl text-xl text-balance text-muted-foreground">
          {t(
            'tuturuuu_brings_all_your_productivity_tools_together_in_one_unified_workspace'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div>
          <h3 className="mb-6 text-2xl font-bold">
            {t('everything_works_together')}
          </h3>
          <p className="mb-8 text-lg text-muted-foreground">
            {t('no_more_switching_between_apps_or_losing_context')}
          </p>

          <div className="mb-8 space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-calendar-bg-purple">
                <Calendar className="h-6 w-6 text-dynamic-purple" />
              </div>
              <div>
                <h4 className="mb-1 text-lg font-semibold">
                  {t('calendar_tasks')}
                </h4>
                <p className="text-muted-foreground">
                  {t(
                    'tasks_automatically_appear_in_your_calendar_scheduled_at_the_optimal_time_based_on_priority_and_deadline'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-calendar-bg-blue">
                <Video className="h-6 w-6 text-dynamic-blue" />
              </div>
              <div>
                <h4 className="mb-1 text-lg font-semibold">
                  {t('meetings_chat')}
                </h4>
                <p className="text-muted-foreground">
                  {t(
                    'tuturuuu_meetings_integrate_with_chat_for_pre_meeting_discussions_and_post_meeting_follow_ups'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-calendar-bg-green">
                <Mail className="h-6 w-6 text-dynamic-green" />
              </div>
              <div>
                <h4 className="mb-1 text-lg font-semibold">
                  {t('email_calendar')}
                </h4>
                <p className="text-muted-foreground">
                  {t(
                    'emails_can_be_converted_to_calendar_events_or_tasks_with_a_single_click'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-calendar-bg-orange">
                <MessageSquare className="h-6 w-6 text-dynamic-orange" />
              </div>
              <div>
                <h4 className="mb-1 text-lg font-semibold">
                  {t('chat_tasks')}
                </h4>
                <p className="text-muted-foreground">
                  {t(
                    'create_and_assign_tasks_directly_from_chat_conversations_keeping_everything_in_context'
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="integration-image">
          <div className="relative">
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-calendar-bg-purple opacity-20 blur-3xl filter"></div>
            <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-calendar-bg-blue opacity-20 blur-3xl filter"></div>

            <div className="relative overflow-hidden rounded-xl border bg-white shadow-xl dark:bg-foreground/5">
              <div className="bg-gradient-to-r from-dynamic-purple to-dynamic-blue p-3 text-white">
                <h3 className="font-medium">{t('unified_workspace')}</h3>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-dynamic-purple" />
                      <h4 className="text-sm font-medium text-dynamic-purple">
                        {t('calendar')}
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
                        {t('tasks')}
                      </h4>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-3 rounded-full border border-dynamic-blue"></div>
                        <span className="truncate text-xs text-dynamic-blue">
                          {t('finalize_report')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-3 rounded-full border border-dynamic-blue"></div>
                        <span className="truncate text-xs text-dynamic-blue">
                          {t('review_design')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Video className="h-4 w-4 text-dynamic-green" />
                      <h4 className="text-sm font-medium text-dynamic-green">
                        {t('meetings')}
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
                        {t('team_sync')}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-dynamic-light-orange/30 bg-calendar-bg-orange p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-dynamic-orange" />
                      <h4 className="text-sm font-medium text-dynamic-orange">
                        {t('chat')}
                      </h4>
                    </div>
                    <div className="rounded bg-white p-1 text-[10px] text-dynamic-orange dark:bg-foreground/5">
                      {t('latest_updates_on_project')}
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-dynamic-red" />
                    <h4 className="text-sm font-medium text-dynamic-red">
                      {t('email')}
                    </h4>
                  </div>
                  <div className="rounded bg-white p-1 text-[10px] text-dynamic-red dark:bg-foreground/5">
                    {t('2_new_messages_from_clients')}
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
