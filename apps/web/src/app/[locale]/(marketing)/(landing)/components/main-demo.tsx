import {
  ArrowRight,
  Calendar,
  Check,
  Clock,
  Mail,
  MessageSquare,
  Sparkles,
  Video,
} from '@tuturuuu/ui/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/vi';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

export const MainDemo = ({
  calendarRef,
}: {
  calendarRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const locale = useLocale();
  const t = useTranslations('landing');
  const [activeTab, setActiveTab] = useState('calendar');

  return (
    <div className="w-full lg:w-1/2" ref={calendarRef}>
      <div className="relative">
        <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-dynamic-light-purple opacity-20 blur-3xl filter"></div>
        <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-dynamic-light-blue opacity-20 blur-3xl filter"></div>

        <div className="relative overflow-hidden rounded-xl border shadow-2xl">
          <div className="bg-gradient-to-br from-dynamic-light-indigo from-10% via-dynamic-light-blue via-30% to-dynamic-light-red to-90% p-3 text-white dark:from-dynamic-light-indigo/30 dark:via-dynamic-light-orange/30 dark:to-dynamic-light-green/30">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">{t('tuturuuu_workspace')}</h3>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-full bg-red-400"></div>
                <div className="h-3 w-3 rounded-full bg-yellow-400"></div>
                <div className="h-3 w-3 rounded-full bg-green-400"></div>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-2 rounded-lg bg-white/10 p-1 text-center font-semibold md:grid-cols-5">
              <button
                className={`col-span-3 flex w-full flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors md:col-span-1 ${
                  activeTab === 'calendar'
                    ? 'bg-white text-black'
                    : 'text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab('calendar')}
              >
                <Calendar className="h-4 w-4" />
                <div>{t('calendar')}</div>
              </button>
              <button
                className={`col-span-3 flex w-full flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors md:col-span-1 ${
                  activeTab === 'tasks'
                    ? 'bg-white text-black'
                    : 'text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab('tasks')}
              >
                <Check className="h-4 w-4" />
                <div>{t('tasks')}</div>
              </button>
              <button
                className={`col-span-2 flex w-full flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors md:col-span-1 ${
                  activeTab === 'meetings'
                    ? 'bg-white text-black'
                    : 'text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab('meetings')}
              >
                <Video className="h-4 w-4" />
                <div>{t('meetings')}</div>
              </button>
              <button
                className={`col-span-2 flex w-full flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors md:col-span-1 ${
                  activeTab === 'chat'
                    ? 'bg-white text-black'
                    : 'text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab('chat')}
              >
                <MessageSquare className="h-4 w-4" />
                <div>{t('chat')}</div>
              </button>
              <button
                className={`col-span-2 flex w-full flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors md:col-span-1 ${
                  activeTab === 'mail'
                    ? 'bg-white text-black'
                    : 'text-white hover:bg-white/10'
                }`}
                onClick={() => setActiveTab('mail')}
              >
                <Mail className="h-4 w-4" />
                <div>{t('email')}</div>
              </button>
            </div>
          </div>

          <div className="p-4">
            {activeTab === 'calendar' && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-purple">
                      <ArrowRight className="h-4 w-4 rotate-180" />
                    </button>
                    <h3 className="font-medium">
                      {new Date().toLocaleDateString(locale, {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </h3>
                    <button className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-purple">
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded-md border border-dynamic-light-yellow/30 bg-calendar-bg-yellow px-3 py-1 text-xs font-medium text-dynamic-yellow">
                      {t('today')}
                    </button>
                    <button className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                      {t('month')}
                    </button>
                  </div>
                </div>

                <div className="mb-2 grid grid-cols-7 gap-1">
                  {(locale === 'vi'
                    ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
                    : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
                  ).map((day, i) => (
                    <div
                      key={i}
                      className="text-center text-sm font-medium text-muted-foreground"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }).map((_, i) => {
                    const isToday = i === 15;
                    const hasMeeting = [3, 8, 10, 15, 16, 22, 27].includes(i);
                    const hasFocus = [4, 11, 18, 25].includes(i);
                    const hasTask = [2, 7, 9, 14, 17, 21, 28].includes(i);
                    const hasHighPriority = [9, 17].includes(i);

                    return (
                      <div
                        key={i}
                        className={`relative flex aspect-square items-center justify-center rounded-md border text-sm font-semibold ${
                          isToday
                            ? 'border-dynamic-purple/30 bg-calendar-bg-purple text-dynamic-purple'
                            : hasMeeting
                              ? 'border-dynamic-blue/30 bg-calendar-bg-blue text-dynamic-blue'
                              : hasFocus
                                ? 'border-dynamic-green/30 bg-calendar-bg-green text-dynamic-green'
                                : hasTask
                                  ? hasHighPriority
                                    ? 'border-dynamic-red/30 bg-calendar-bg-red text-dynamic-red'
                                    : 'border-dynamic-yellow/30 bg-calendar-bg-yellow text-dynamic-yellow'
                                  : 'hover:bg-foreground/5'
                        }`}
                      >
                        {i + 1}
                        {hasHighPriority && (
                          <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-dynamic-red"></span>
                        )}
                        {hasMeeting && !isToday && (
                          <span className="absolute bottom-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-dynamic-blue"></span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 space-y-2">
                  <div className="rounded-md border border-dynamic-blue/30 bg-calendar-bg-blue p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="font-medium text-dynamic-blue">
                        {t('team_sync')}
                      </div>
                      <div className="flex items-center gap-1 rounded bg-calendar-bg-blue px-1.5 text-xs text-dynamic-blue">
                        <Video className="h-3 w-3" />
                        <span>Tuturuuu</span>
                      </div>
                    </div>
                    <div className="text-xs text-dynamic-blue">
                      {t('team_sync_time')}
                    </div>
                  </div>

                  <div className="rounded-md border border-dynamic-yellow/30 bg-calendar-bg-yellow p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="font-medium text-dynamic-yellow">
                        {t('quarterly_report')}
                      </div>
                      <div className="flex items-center gap-1 rounded bg-calendar-bg-yellow px-1.5 text-xs text-dynamic-yellow">
                        <Check className="h-3 w-3" />
                        <span>{t('task')}</span>
                      </div>
                    </div>
                    <div className="text-xs text-dynamic-yellow">
                      {t('quarterly_report_time')}
                    </div>
                  </div>

                  <div className="rounded-md border border-dynamic-red/30 bg-calendar-bg-red p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="font-medium text-dynamic-red">
                        {t('client_proposal')}
                      </div>
                      <div className="flex items-center gap-1 rounded bg-calendar-bg-red px-1.5 text-xs text-dynamic-red">
                        <Check className="h-3 w-3" />
                        <span>{t('task')}</span>
                      </div>
                    </div>
                    <div className="text-xs text-dynamic-red">
                      {t('client_proposal_time')}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium">{t('my_tasks')}</h3>
                  <div className="flex items-center gap-2">
                    <button className="rounded-md border border-dynamic-light-yellow/30 bg-calendar-bg-yellow px-3 py-1 text-xs font-medium text-dynamic-yellow">
                      {t('add_task')}
                    </button>
                    <button className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                      {t('filter')}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-3 transition-colors hover:border-dynamic-light-blue/30">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-5 w-5 rounded-full border-2 border-dynamic-blue"></div>
                      <div className="flex-1">
                        <h4 className="font-medium text-dynamic-blue">
                          {t('finalize_q2_marketing_strategy')}
                        </h4>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {dayjs()
                                .add(1, 'day')
                                .locale(locale)
                                .format('DD MMM')}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{t('3-hours')}</span>
                          </span>
                          <span className="rounded border border-dynamic-light-red/30 bg-calendar-bg-red px-1.5 py-0.5 text-xs text-dynamic-red">
                            {t('high_priority')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-dynamic-light-yellow/30 bg-calendar-bg-yellow p-3 transition-colors hover:border-dynamic-light-yellow/30">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-5 w-5 rounded-full border-2 border-dynamic-yellow"></div>
                      <div className="flex-1">
                        <h4 className="font-medium text-dynamic-yellow">
                          {t('review_product_design_mockups')}
                        </h4>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {dayjs()
                                .add(2, 'day')
                                .locale(locale)
                                .format('DD MMM')}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{t('2-hours')}</span>
                          </span>
                          <span className="rounded border border-dynamic-light-yellow/30 bg-calendar-bg-yellow px-1.5 py-0.5 text-xs text-dynamic-yellow">
                            {t('medium_priority')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-3 transition-colors hover:border-dynamic-light-red/30">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-5 w-5 rounded-full border-2 border-dynamic-red"></div>
                      <div className="flex-1">
                        <h4 className="font-medium text-dynamic-red">
                          {t('prepare_for_team_meeting')}
                        </h4>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {dayjs()
                                .add(4, 'day')
                                .locale(locale)
                                .format('DD MMM')}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{t('1-hour')}</span>
                          </span>
                          <span className="rounded border border-dynamic-light-green/30 bg-calendar-bg-green px-1.5 py-0.5 text-xs text-dynamic-green">
                            {t('low_priority')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-calendar-bg-green">
                      <Sparkles className="h-4 w-4 text-dynamic-green" />
                    </div>
                    <div>
                      <h4 className="font-medium text-dynamic-green">
                        {t('ai_suggestion')}
                      </h4>
                      <p className="text-xs text-dynamic-green">
                        {t('ai_suggestion_description')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'meetings' && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium">{t('upcoming_meetings')}</h3>
                  <button className="flex items-center gap-1 rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                    <Video className="h-3 w-3" />
                    <span>{t('new_meeting')}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-medium text-dynamic-green">
                        {t('team_sync')}
                      </h4>
                      <span className="rounded bg-calendar-bg-green px-2 py-0.5 text-xs text-dynamic-green">
                        {t('today_at_10_am')}
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex -space-x-2 font-semibold">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-green/30 bg-calendar-bg-green text-xs font-medium text-dynamic-light-green">
                          A
                        </div>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-blue/30 bg-calendar-bg-blue text-xs font-medium text-dynamic-light-blue">
                          B
                        </div>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-yellow/30 bg-calendar-bg-yellow text-xs font-medium text-dynamic-light-yellow">
                          C
                        </div>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-red/30 bg-calendar-bg-red text-xs font-medium text-dynamic-light-red">
                          D
                        </div>
                      </div>
                      <span className="text-xs text-dynamic-blue">
                        {t('4-participants')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="flex items-center gap-1 rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                        <Video className="h-3 w-3" />
                        <span>{t('join_tuturuuu')}</span>
                      </button>
                      <button className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                        {t('view_details')}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-medium text-dynamic-red">
                        {t('client_presentation')}
                      </h4>
                      <span className="rounded bg-calendar-bg-red px-2 py-0.5 text-xs text-dynamic-red">
                        {t('tomorrow_at_2_pm')}
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex -space-x-2 font-semibold">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-red/30 bg-calendar-bg-red text-xs font-medium text-dynamic-light-red">
                          Y
                        </div>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dynamic-light-indigo/30 bg-calendar-bg-indigo text-xs font-medium text-dynamic-light-indigo">
                          Z
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t('2-participants')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                        {t('prepare')}
                      </button>
                      <button className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                        {t('view_details')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-dynamic-light-yellow/30 bg-calendar-bg-yellow p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-calendar-bg-yellow">
                      <Sparkles className="h-4 w-4 text-dynamic-yellow" />
                    </div>
                    <div>
                      <h4 className="font-medium text-dynamic-yellow">
                        {t('tuturuuu_features')}
                      </h4>
                      <p className="text-xs text-dynamic-yellow">
                        {t('tuturuuu_features_description')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium">{t('team_chat')}</h3>
                  <button className="flex items-center gap-1 rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue">
                    <MessageSquare className="h-3 w-3" />
                    <span>{t('new_chat')}</span>
                  </button>
                </div>

                <div className="flex h-1/2 flex-col rounded-lg border border-dynamic-light-orange/30 bg-calendar-bg-orange">
                  <div className="border-b border-dynamic-light-orange/30 p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-calendar-bg-orange">
                        <span className="text-sm font-medium text-dynamic-orange">
                          {t('mp')}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-medium text-dynamic-orange">
                          {t('marketing_project')}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {t('5-members')} • {t('3-online')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-green/30 bg-calendar-bg-green">
                        <span className="text-xs font-medium">
                          {t('alex-initials')}
                        </span>
                      </div>
                      <div className="max-w-[80%] rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-2 text-sm">
                        <p className="text-xs font-medium text-dynamic-green">
                          {t('alex')}
                        </p>
                        <p>
                          {t(
                            'has_everyone_reviewed_the_latest_campaign_mockups'
                          )}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('10_15_am')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start justify-end gap-2">
                      <div className="max-w-[80%] rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red p-2 text-sm">
                        <p className="text-xs font-medium text-dynamic-red">
                          {t('you')}
                        </p>
                        <p>
                          {t(
                            'yes_ive_added_my_comments_in_the_shared_document'
                          )}
                        </p>
                        <p className="mt-1 text-xs text-dynamic-red">
                          {t('10_17_am')}
                        </p>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-red/30 bg-calendar-bg-red">
                        <span className="text-xs font-medium">
                          {t('you-initials')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-blue/30 bg-calendar-bg-blue">
                        <span className="text-xs font-medium">
                          {t('ben-initials')}
                        </span>
                      </div>
                      <div className="max-w-[80%] rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-2 text-sm">
                        <p className="text-xs font-medium text-dynamic-blue">
                          {t('ben')}
                        </p>
                        <p>
                          {t(
                            'ill_finish_my_review_by_eod_need_to_coordinate_with_the_design_team_first'
                          )}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('10_20_am')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-dynamic-light-orange/30 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={t('type_a_message')}
                        className="flex-1 rounded-lg border border-dynamic-light-orange/30 bg-calendar-bg-orange px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-dynamic-orange focus:outline-none"
                      />
                      <button className="flex h-8 w-8 items-center justify-center rounded-full bg-calendar-bg-orange text-dynamic-orange">
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'mail' && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium">{t('smart_mail')}</h3>
                  <button className="flex items-center gap-1 rounded-md border border-dynamic-light-red/30 bg-calendar-bg-red px-3 py-1 text-xs font-medium text-dynamic-red">
                    <Mail className="h-3 w-3" />
                    <span>{t('compose')}</span>
                  </button>
                </div>

                <div className="rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red">
                  <div className="flex items-center gap-2 border-b border-dynamic-light-red/30 p-3">
                    <input
                      type="text"
                      placeholder={t('search_emails')}
                      className="flex-1 rounded-lg border border-dynamic-light-red/30 bg-calendar-bg-red px-3 py-1.5 text-sm focus:border-transparent focus:ring-2 focus:ring-dynamic-red focus:outline-none"
                    />
                    <button className="rounded-md border border-dynamic-light-red/30 bg-calendar-bg-red px-3 py-1.5 text-xs font-medium text-dynamic-red">
                      {t('filter')}
                    </button>
                  </div>

                  <div className="divide-y divide-dynamic-light-red/30">
                    <div className="cursor-pointer bg-calendar-bg-blue p-3 transition-colors hover:bg-dynamic-light-blue/30">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-blue/30 bg-calendar-bg-blue">
                          <span className="text-xs font-medium text-dynamic-blue">
                            {t('ac-initials')}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="line-clamp-1 font-medium text-dynamic-blue">
                              {t('alex_chen')}
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              {t('10_30_am')}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm font-medium">
                            {t('project_update_q2_marketing_campaign')}
                          </p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {t(
                              'hi_team_i_wanted_to_share_the_latest_updates_on_our_q2_marketing_campaign_weve_made_significant_progress'
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="cursor-pointer bg-calendar-bg-yellow p-3 transition-colors hover:bg-dynamic-light-yellow/30">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-yellow/30 bg-calendar-bg-yellow">
                          <span className="text-xs font-medium text-dynamic-yellow">
                            {t('st-initials')}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="line-clamp-1 font-medium text-dynamic-yellow">
                              {t('sarah_thompson')}
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              {t('yesterday')}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm">
                            {t('client_feedback_on_proposal')}
                          </p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {t(
                              'the_client_has_reviewed_our_proposal_and_has_some_feedback_overall_theyre_impressed_with_our_approach'
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="cursor-pointer rounded-b-lg bg-calendar-bg-green p-3 transition-colors hover:bg-dynamic-light-green/30">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-green/30 bg-calendar-bg-green">
                          <span className="text-xs font-medium text-dynamic-green">
                            {t('jd-initials')}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="line-clamp-1 font-medium text-dynamic-green">
                              {t('john_doe')}
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              {t('may_12')}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm">
                            {t('meeting_follow_up_action_items')}
                          </p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {t(
                              'following_our_meeting_yesterday_ive_compiled_a_list_of_action_items_for_each_team_member'
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-calendar-bg-blue">
                      <Sparkles className="h-4 w-4 text-dynamic-blue" />
                    </div>
                    <div>
                      <h4 className="font-medium text-dynamic-blue">
                        {t('smart_mail_features')}
                      </h4>
                      <p className="text-xs text-dynamic-blue">
                        {t('smart_mail_features_description')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
