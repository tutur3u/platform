'use client';

import { gsap } from '@tuturuuu/ui/gsap';
import {
  Brain,
  Calendar,
  Check,
  Clock,
  MessageSquare,
  Video,
  Zap,
} from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

export function StrategicSection() {
  const t = useTranslations('landing');

  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
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
    }, sectionRef);

    return () => {
      ctx.revert();
    };
  }, []);

  return (
    <section ref={sectionRef} className="container w-full px-0 pt-20">
      <div className="mb-16 text-center">
        <h2 className="strategic-title mb-4 text-3xl font-bold md:text-4xl">
          <span className="from-dynamic-light-purple/80 to-dynamic-light-blue/80 bg-gradient-to-r bg-clip-text text-transparent">
            {t('strategic_advantages')}
          </span>
        </h2>
        <p className="strategic-title text-muted-foreground mx-auto max-w-3xl text-xl">
          {t('why_tuturuuu_is_a_game_changer_for_your_productivity')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-purple/80 to-dynamic-light-blue/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">{t('unified_workspace')}</h3>
          <p className="text-muted-foreground mb-4">
            {t(
              'stop_switching_between_apps_and_losing_context_tuturuuu_brings_your_calendar_tasks_meetings_chat_and_email_into_one_intelligent_workspace'
            )}
          </p>
          <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-4">
            <h4 className="text-dynamic-purple mb-2 font-medium">
              {t('strategic_impact')}
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('reduce_context_switching_by_70')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('save_5_hours_weekly_on_app_switching')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('maintain_complete_workflow_visibility')}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-blue/80 to-dynamic-light-blue/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">
            {t('ai_powered_intelligence')}
          </h3>
          <p className="text-muted-foreground mb-4">
            {t(
              'tuturuuu_s_advanced_ai_understands_your_priorities_deadlines_and_preferences_to_optimize_your_schedule_automatically'
            )}
          </p>
          <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue rounded-lg border p-4">
            <h4 className="text-dynamic-blue mb-2 font-medium">
              {t('strategic_impact')}
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('reduce_scheduling_time_by_85')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('ensure_high_priority_work_gets_done')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('prevent_burnout_through_workload_balancing')}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-green/80 to-dynamic-light-green/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <Clock className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">
            {t('focus_time_protection')}
          </h3>
          <p className="text-muted-foreground mb-4">
            {t(
              'tuturuuu_automatically_blocks_out_time_for_deep_work_based_on_your_productivity_patterns_ensuring_you_have_uninterrupted_time_for_meaningful_work'
            )}
          </p>
          <div className="border-dynamic-light-green/30 bg-calendar-bg-green rounded-lg border p-4">
            <h4 className="text-dynamic-green mb-2 font-medium">
              {t('strategic_impact')}
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('gain_10_hours_of_deep_work_weekly')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('increase_quality_of_work_output')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('reduce_stress_from_constant_interruptions')}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-orange/80 to-dynamic-light-orange/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <Video className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">{t('enhanced_meetings')}</h3>
          <p className="text-muted-foreground mb-4">
            {t(
              'tuturuuu_meetings_go_beyond_video_conferencing_with_ai_generated_notes_automatic_task_creation_and_smart_follow_ups'
            )}
          </p>
          <div className="border-dynamic-light-orange/30 bg-calendar-bg-orange rounded-lg border p-4">
            <h4 className="text-dynamic-orange mb-2 font-medium">
              {t('strategic_impact')}
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('eliminate_manual_note_taking')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('ensure_100_follow_through_on_action_items')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('reduce_meeting_time_by_30')}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-red/80 to-dynamic-light-red/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <MessageSquare className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">
            {t('productive_communication')}
          </h3>
          <p className="text-muted-foreground mb-4">
            {t(
              'tuturuuu_s_chat_and_email_systems_are_designed_for_productivity_with_task_creation_meeting_scheduling_and_ai_powered_summaries'
            )}
          </p>
          <div className="border-dynamic-light-red/30 bg-calendar-bg-red rounded-lg border p-4">
            <h4 className="text-dynamic-red mb-2 font-medium">
              {t('strategic_impact')}
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('reduce_email_processing_time_by_60')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>
                  {t('never_miss_important_messages_or_action_items')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>
                  {t('streamline_team_communication_and_collaboration')}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="strategic-card dark:bg-foreground/5 rounded-xl border bg-white p-6">
          <div className="from-dynamic-light-purple/80 to-dynamic-light-blue/80 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br">
            <Calendar className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-3 text-xl font-bold">
            {t('continuous_improvement')}
          </h3>
          <p className="text-muted-foreground mb-4">
            {t(
              'tuturuuu_learns_from_your_habits_and_preferences_over_time_getting_smarter_and_more_personalized_to_make_you_increasingly_productive'
            )}
          </p>
          <div className="border-dynamic-light-purple/30 bg-calendar-bg-purple rounded-lg border p-4">
            <h4 className="text-dynamic-purple mb-2 font-medium">
              {t('strategic_impact')}
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('productivity_increases_month_over_month')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>
                  {t('personalized_experience_based_on_your_work_style')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-dynamic-green mt-0.5 h-4 w-4" />
                <span>{t('ongoing_roi_as_the_system_gets_smarter')}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
