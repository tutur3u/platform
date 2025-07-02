'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  ArrowRight,
  Brain,
  Calendar,
  Check,
  Mail,
  MessageSquare,
  Sparkles,
  Video,
  X as XIcon,
} from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ChatGptComparisonCard } from './comparison/ChatGptComparisonCard';
import { GmailComparisonCard } from './comparison/GmailComparisonCard';
import { MeetComparisonCard } from './comparison/MeetComparisonCard';
import { MessengerComparisonCard } from './comparison/MessengerComparisonCard';

interface Competitor {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  features: { name: string; tuturuuu: boolean; competitor: boolean }[];
  description: string;
}

export function ComparisonSection() {
  const t = useTranslations('landing');

  const competitors: Competitor[] = [
    {
      id: 'calendar',
      name: 'Google Calendar',
      icon: <Calendar className="h-6 w-6" />,
      color: 'blue',
      bgColor: 'bg-blue-500',
      features: [
        { name: t('basic_scheduling'), tuturuuu: true, competitor: true },
        { name: t('calendar_sharing'), tuturuuu: true, competitor: true },
        { name: t('ai_powered_scheduling'), tuturuuu: true, competitor: false },
        { name: t('focus_time_protection'), tuturuuu: true, competitor: false },
        { name: t('workload_balancing'), tuturuuu: true, competitor: false },
        { name: t('task_integration'), tuturuuu: true, competitor: false },
        {
          name: t('team_availability_matching'),
          tuturuuu: true,
          competitor: false,
        },
      ],
      description: t('google_calendar_description'),
    },
    {
      id: 'meet',
      name: 'Google Meet',
      icon: <Video className="h-6 w-6" />,
      color: 'green',
      bgColor: 'bg-green-500',
      features: [
        { name: t('video_conferencing'), tuturuuu: true, competitor: true },
        { name: t('screen_sharing'), tuturuuu: true, competitor: true },
        { name: t('calendar_integration'), tuturuuu: true, competitor: true },
        {
          name: t('ai_generated_meeting_notes'),
          tuturuuu: true,
          competitor: false,
        },
        {
          name: t('automatic_task_creation'),
          tuturuuu: true,
          competitor: false,
        },
        { name: t('smart_follow_ups'), tuturuuu: true, competitor: false },
        { name: t('meeting_analytics'), tuturuuu: true, competitor: false },
      ],
      description: t('google_meet_description'),
    },
    {
      id: 'messenger',
      name: 'Messenger',
      icon: <MessageSquare className="h-6 w-6" />,
      color: 'purple',
      bgColor: 'bg-purple-500',
      features: [
        { name: t('real_time_messaging'), tuturuuu: true, competitor: true },
        { name: t('file_sharing'), tuturuuu: true, competitor: true },
        { name: t('group_chats'), tuturuuu: true, competitor: true },
        { name: t('calendar_integration'), tuturuuu: true, competitor: false },
        {
          name: t('task_creation_from_chat'),
          tuturuuu: true,
          competitor: false,
        },
        { name: t('meeting_scheduling'), tuturuuu: true, competitor: false },
        { name: t('ai_chat_summaries'), tuturuuu: true, competitor: false },
      ],
      description: t('messenger_description'),
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      icon: <Brain className="h-6 w-6" />,
      color: 'blue',
      bgColor: 'bg-cyan-500',
      features: [
        { name: t('ai_assistance'), tuturuuu: true, competitor: true },
        {
          name: t('natural_language_understanding'),
          tuturuuu: true,
          competitor: true,
        },
        { name: t('calendar_integration'), tuturuuu: true, competitor: false },
        { name: t('task_management'), tuturuuu: true, competitor: false },
        { name: t('meeting_scheduling'), tuturuuu: true, competitor: false },
        { name: t('email_integration'), tuturuuu: true, competitor: false },
        { name: t('unified_workspace'), tuturuuu: true, competitor: false },
      ],
      description: t('chatgpt_description'),
    },
    {
      id: 'gmail',
      name: 'Gmail',
      icon: <Mail className="h-6 w-6" />,
      color: 'red',
      bgColor: 'bg-red-500',
      features: [
        { name: t('email_management'), tuturuuu: true, competitor: true },
        { name: t('basic_categorization'), tuturuuu: true, competitor: true },
        {
          name: t('ai_powered_prioritization'),
          tuturuuu: true,
          competitor: false,
        },
        {
          name: t('task_creation_from_emails'),
          tuturuuu: true,
          competitor: false,
        },
        { name: t('meeting_scheduling'), tuturuuu: true, competitor: false },
        { name: t('smart_follow_ups'), tuturuuu: true, competitor: false },
        { name: t('calendar_integration'), tuturuuu: true, competitor: true },
      ],
      description: t('gmail_description'),
    },
  ];

  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeCompetitor, setActiveCompetitor] = useState('calendar');
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  const currentCompetitor = (competitors.find(
    (c) => c.id === activeCompetitor
  ) || competitors[0]) as Competitor;

  const displayedFeatures = showAllFeatures
    ? currentCompetitor.features
    : currentCompetitor.features.slice(0, 5);

  return (
    <section ref={sectionRef} className="container w-full px-0 pt-20 pb-20">
      <div className="comparison-title-wrapper mb-16 text-center">
        <div className="mb-4 inline-flex items-center justify-center rounded-full bg-purple-100 px-4 py-1 dark:bg-purple-900/30">
          <Sparkles className="mr-2 h-4 w-4 text-purple-600 dark:text-purple-400" />
          <span className="font-medium text-purple-600 text-sm dark:text-purple-400">
            {t('competitive_advantage')}
          </span>
        </div>
        <h2 className="comparison-title mb-6 font-bold text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-blue bg-clip-text text-transparent">
            {t('why_choose_tuturuuu')}
          </span>
        </h2>
        <p className="mx-auto max-w-3xl text-muted-foreground text-xl leading-relaxed">
          {t(
            'see_how_tuturuuu_compares_to_traditional_productivity_tools_and_why_its_the_smarter_choice'
          )}
        </p>
      </div>

      <div className="comparison-tabs mb-12 flex flex-wrap justify-center gap-4">
        {competitors.map((competitor) => (
          <button
            key={competitor.id}
            className={`competitor-button flex items-center gap-2 rounded-full px-4 py-2.5 font-medium text-sm transition-all duration-300 ${
              activeCompetitor === competitor.id
                ? `${competitor.bgColor} text-white shadow-md`
                : 'border bg-white/90 text-muted-foreground hover:border-gray-300 hover:bg-white hover:text-foreground hover:shadow-sm dark:bg-foreground/5 dark:hover:bg-foreground/10'
            }`}
            onClick={() => setActiveCompetitor(competitor.id)}
            aria-pressed={activeCompetitor === competitor.id}
          >
            <div
              className={`${activeCompetitor === competitor.id ? 'text-white' : 'text-gray-500'}`}
            >
              {competitor.icon}
            </div>
            <span>vs {competitor.name}</span>
          </button>
        ))}
      </div>

      <div className="comparison-content grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
        <div>
          <div className="mb-8 flex items-center gap-4">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-xl ${currentCompetitor.bgColor} bg-opacity-90 shadow-md`}
            >
              <div className="text-white">{currentCompetitor.icon}</div>
            </div>
            <div>
              <h3 className="mb-1 font-bold text-2xl">
                Tuturuuu {t('vs')} {currentCompetitor.name}
              </h3>
              <div className="text-muted-foreground text-sm">
                {t('discover_the_key_differences')}
              </div>
            </div>
          </div>

          <p className="mb-10 text-lg text-muted-foreground leading-relaxed">
            {currentCompetitor.description}
          </p>

          <div className="feature-table mb-10 overflow-hidden rounded-xl border bg-white/90 shadow-lg backdrop-blur-sm dark:bg-foreground/5">
            <div className="grid grid-cols-3 bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-blue p-5 text-white">
              <div className="col-span-1 font-medium">{t('feature')}</div>
              <div className="col-span-1 text-center font-medium">Tuturuuu</div>
              <div className="col-span-1 text-center font-medium">
                {currentCompetitor.name}
              </div>
            </div>

            {displayedFeatures.map((feature, index) => (
              <div
                key={index}
                className={`feature-row grid grid-cols-3 items-center p-5 ${index % 2 === 0 ? 'bg-gray-50 dark:bg-foreground/10' : 'bg-white dark:bg-foreground/5'}`}
              >
                <div className="col-span-1 font-medium">{feature.name}</div>
                <div className="col-span-1 flex justify-center">
                  {feature.tuturuuu ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dynamic-light-green/30 bg-calendar-bg-green transition-transform duration-300 hover:scale-110">
                      <Check className="h-5 w-5 text-dynamic-green" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dynamic-light-red/30 bg-calendar-bg-red">
                      <XIcon className="h-5 w-5 text-dynamic-red" />
                    </div>
                  )}
                </div>
                <div className="col-span-1 flex justify-center">
                  {feature.competitor ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dynamic-light-green/30 bg-calendar-bg-green">
                      <Check className="h-5 w-5 text-dynamic-green" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dynamic-light-red/30 bg-calendar-bg-red transition-transform duration-300 hover:scale-110">
                      <XIcon className="h-5 w-5 text-dynamic-red" />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {currentCompetitor.features.length > 5 && (
              <div className="flex justify-center border-t p-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllFeatures(!showAllFeatures)}
                  className="font-medium text-muted-foreground text-sm hover:text-foreground"
                >
                  {showAllFeatures ? t('show_less') : t('show_all_features')}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="relative overflow-hidden rounded-xl border bg-white/90 p-6 shadow-xl backdrop-blur-sm dark:bg-foreground/5">
            <div className="-mt-20 -mr-20 absolute top-0 right-0 h-40 w-40 rounded-full bg-gradient-to-br from-dynamic-light-purple to-dynamic-light-blue opacity-20 blur-3xl filter"></div>

            {activeCompetitor === 'calendar' && (
              <div className="relative space-y-4">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-medium">
                    <Calendar className="h-5 w-5 text-dynamic-blue" />
                    <span>{t('product_comparison')}</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="rounded-xl border bg-white p-5 shadow-md transition-all duration-300 hover:shadow-lg dark:bg-foreground/5">
                    <div className="mb-4 flex items-center gap-2 border-b pb-3">
                      <Calendar className="h-5 w-5 text-blue-500" />
                      <h4 className="font-medium">Google Calendar</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-md bg-calendar-bg-blue p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                        <div className="font-medium">{t('team_meeting')}</div>
                        <div className="text-dynamic-blue">
                          {t('10_00_am_11_00_am')}
                        </div>
                      </div>
                      <div className="rounded-md bg-calendar-bg-blue p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                        <div className="font-medium">{t('client_call')}</div>
                        <div className="text-dynamic-blue">
                          {t('1_00_pm_2_00_pm')}
                        </div>
                      </div>
                      <div className="rounded-md bg-calendar-bg-blue p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                        <div className="font-medium">{t('project_review')}</div>
                        <div className="text-dynamic-blue">
                          {t('3_00_pm_4_00_pm')}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-dynamic-red text-sm">
                      <XIcon className="h-4 w-4 flex-none" />
                      <span>{t('no_focus_time_protection')}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg">
                    <div className="mb-4 flex items-center gap-2 border-dynamic-light-purple/30 border-b pb-3">
                      <Calendar className="h-5 w-5 text-dynamic-purple" />
                      <h4 className="font-medium">TuPlan</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-md border border-dynamic-light-green/30 bg-calendar-bg-green p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                        <div className="font-medium text-dynamic-green">
                          {t('focus_time')}
                        </div>
                        <div className="text-dynamic-green">
                          {t('9_00_am_11_00_am')}
                        </div>
                      </div>
                      <div className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                        <div className="font-medium text-dynamic-blue">
                          {t('team_meeting')}
                        </div>
                        <div className="text-dynamic-blue">
                          {t('11_30_am_12_30_pm')}
                        </div>
                      </div>
                      <div className="rounded-md border border-dynamic-light-orange/30 bg-calendar-bg-orange p-3 text-sm transition-all duration-300 hover:translate-y-[-2px]">
                        <div className="font-medium text-dynamic-orange">
                          {t('client_call')}
                        </div>
                        <div className="text-dynamic-orange">
                          {t('2_00_pm_3_00_pm')}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-dynamic-green text-sm">
                      <Check className="h-4 w-4 flex-none" />
                      <span>{t('ai_optimized_for_focus_time')}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-5">
                  <h4 className="mb-3 font-medium text-dynamic-blue">
                    {t('tuturuuu_advantages')}
                  </h4>
                  <ul className="space-y-2.5 text-sm">
                    <li className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
                      <span>
                        {t(
                          'automatically_protects_focus_time_for_deep_work_based_on_your_preferences'
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
                      <span>
                        {t(
                          'balances_workload_to_prevent_burnout_and_overcommitment'
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
                      <span>
                        {t(
                          'intelligently_schedules_meetings_when_team_energy_is_highest_for_more_productive_collaboration'
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 text-dynamic-green" />
                      <span>
                        {t(
                          'integrates_tasks_directly_into_your_calendar_with_smart_prioritization'
                        )}
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="mt-6 text-center">
                  <div className="mb-3 font-medium">
                    {t('ready_to_upgrade_your_workflow')}
                  </div>
                  <Link href="/onboarding">
                    <Button
                      className="w-full bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-blue text-white"
                      size="lg"
                    >
                      {t('get_started')} <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {activeCompetitor === 'meet' && <MeetComparisonCard />}
            {activeCompetitor === 'messenger' && <MessengerComparisonCard />}
            {activeCompetitor === 'chatgpt' && <ChatGptComparisonCard />}
            {activeCompetitor === 'gmail' && <GmailComparisonCard />}
          </div>
        </div>
      </div>
    </section>
  );
}
