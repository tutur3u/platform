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
          <span className="from-dynamic-purple to-dynamic-blue bg-gradient-to-r bg-clip-text text-transparent">
            {t('seamless_integration')}
          </span>
        </h2>
        <p className="integration-title text-muted-foreground mx-auto max-w-3xl text-balance text-xl">
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
          <p className="text-muted-foreground mb-8 text-lg">
            {t('no_more_switching_between_apps_or_losing_context')}
          </p>

          <div className="mb-8 space-y-6">
            <div className="flex items-start gap-4">
              <div className="bg-calendar-bg-purple flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                <Calendar className="text-dynamic-purple h-6 w-6" />
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
              <div className="bg-calendar-bg-blue flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                <Video className="text-dynamic-blue h-6 w-6" />
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
              <div className="bg-calendar-bg-green flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                <Mail className="text-dynamic-green h-6 w-6" />
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
              <div className="bg-calendar-bg-orange flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                <MessageSquare className="text-dynamic-orange h-6 w-6" />
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
            <div className="bg-calendar-bg-purple absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-3xl filter"></div>
            <div className="bg-calendar-bg-blue absolute -bottom-10 -left-10 h-40 w-40 rounded-full opacity-20 blur-3xl filter"></div>

            <div className="dark:bg-foreground/5 relative overflow-hidden rounded-xl border bg-white shadow-xl">
              <div className="from-dynamic-purple to-dynamic-blue bg-gradient-to-r p-3 text-white">
                <h3 className="font-medium">{t('unified_workspace')}</h3>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Calendar className="text-dynamic-purple h-4 w-4" />
                      <h4 className="text-dynamic-purple text-sm font-medium">
                        {t('calendar')}
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
                        {t('tasks')}
                      </h4>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <div className="border-dynamic-blue h-3 w-3 rounded-full border"></div>
                        <span className="text-dynamic-blue truncate text-xs">
                          {t('finalize_report')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="border-dynamic-blue h-3 w-3 rounded-full border"></div>
                        <span className="text-dynamic-blue truncate text-xs">
                          {t('review_design')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-dynamic-light-green/30 bg-calendar-bg-green rounded-lg border p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Video className="text-dynamic-green h-4 w-4" />
                      <h4 className="text-dynamic-green text-sm font-medium">
                        {t('meetings')}
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
                        {t('team_sync')}
                      </span>
                    </div>
                  </div>

                  <div className="border-dynamic-light-orange/30 bg-calendar-bg-orange rounded-lg border p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <MessageSquare className="text-dynamic-orange h-4 w-4" />
                      <h4 className="text-dynamic-orange text-sm font-medium">
                        {t('chat')}
                      </h4>
                    </div>
                    <div className="text-dynamic-orange dark:bg-foreground/5 rounded bg-white p-1 text-[10px]">
                      {t('latest_updates_on_project')}
                    </div>
                  </div>
                </div>

                <div className="border-dynamic-light-red/30 bg-calendar-bg-red mt-3 rounded-lg border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Mail className="text-dynamic-red h-4 w-4" />
                    <h4 className="text-dynamic-red text-sm font-medium">
                      {t('email')}
                    </h4>
                  </div>
                  <div className="text-dynamic-red dark:bg-foreground/5 rounded bg-white p-1 text-[10px]">
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
