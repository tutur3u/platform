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
        <div className="bg-dynamic-light-purple absolute -left-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-3xl filter"></div>
        <div className="bg-dynamic-light-blue absolute -bottom-10 -right-10 h-40 w-40 rounded-full opacity-20 blur-3xl filter"></div>

        <div className="relative overflow-hidden rounded-xl border shadow-2xl">
          <div className="from-dynamic-light-indigo via-dynamic-light-blue to-dynamic-light-red dark:from-dynamic-light-indigo/30 dark:via-dynamic-light-orange/30 dark:to-dynamic-light-green/30 bg-gradient-to-br from-10% via-30% to-90% p-3 text-white">
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
                    <button className="border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-purple flex h-8 w-8 items-center justify-center rounded-full border">
                      <ArrowRight className="h-4 w-4 rotate-180" />
                    </button>
                    <h3 className="font-medium">
                      {new Date().toLocaleDateString(locale, {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </h3>
                    <button className="border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-purple flex h-8 w-8 items-center justify-center rounded-full border">
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow text-dynamic-yellow rounded-md border px-3 py-1 text-xs font-medium">
                      {t('today')}
                    </button>
                    <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue rounded-md border px-3 py-1 text-xs font-medium">
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
                      className="text-muted-foreground text-center text-sm font-medium"
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
                          <span className="bg-dynamic-red absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full"></span>
                        )}
                        {hasMeeting && !isToday && (
                          <span className="bg-dynamic-blue absolute bottom-0.5 left-0.5 h-1.5 w-1.5 rounded-full"></span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 space-y-2">
                  <div className="border-dynamic-blue/30 bg-calendar-bg-blue rounded-md border p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="text-dynamic-blue font-medium">
                        {t('team_sync')}
                      </div>
                      <div className="bg-calendar-bg-blue text-dynamic-blue flex items-center gap-1 rounded px-1.5 text-xs">
                        <Video className="h-3 w-3" />
                        <span>Tuturuuu</span>
                      </div>
                    </div>
                    <div className="text-dynamic-blue text-xs">
                      {t('team_sync_time')}
                    </div>
                  </div>

                  <div className="border-dynamic-yellow/30 bg-calendar-bg-yellow rounded-md border p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="text-dynamic-yellow font-medium">
                        {t('quarterly_report')}
                      </div>
                      <div className="bg-calendar-bg-yellow text-dynamic-yellow flex items-center gap-1 rounded px-1.5 text-xs">
                        <Check className="h-3 w-3" />
                        <span>{t('task')}</span>
                      </div>
                    </div>
                    <div className="text-dynamic-yellow text-xs">
                      {t('quarterly_report_time')}
                    </div>
                  </div>

                  <div className="border-dynamic-red/30 bg-calendar-bg-red rounded-md border p-2 text-sm">
                    <div className="flex justify-between">
                      <div className="text-dynamic-red font-medium">
                        {t('client_proposal')}
                      </div>
                      <div className="bg-calendar-bg-red text-dynamic-red flex items-center gap-1 rounded px-1.5 text-xs">
                        <Check className="h-3 w-3" />
                        <span>{t('task')}</span>
                      </div>
                    </div>
                    <div className="text-dynamic-red text-xs">
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
                    <button className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow text-dynamic-yellow rounded-md border px-3 py-1 text-xs font-medium">
                      {t('add_task')}
                    </button>
                    <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue rounded-md border px-3 py-1 text-xs font-medium">
                      {t('filter')}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue hover:border-dynamic-light-blue/30 rounded-lg border p-3 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="border-dynamic-blue mt-0.5 h-5 w-5 rounded-full border-2"></div>
                      <div className="flex-1">
                        <h4 className="text-dynamic-blue font-medium">
                          {t('finalize_q2_marketing_strategy')}
                        </h4>
                        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
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
                          <span className="border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-red rounded border px-1.5 py-0.5 text-xs">
                            {t('high_priority')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow hover:border-dynamic-light-yellow/30 rounded-lg border p-3 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="border-dynamic-yellow mt-0.5 h-5 w-5 rounded-full border-2"></div>
                      <div className="flex-1">
                        <h4 className="text-dynamic-yellow font-medium">
                          {t('review_product_design_mockups')}
                        </h4>
                        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
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
                          <span className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow text-dynamic-yellow rounded border px-1.5 py-0.5 text-xs">
                            {t('medium_priority')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-dynamic-light-red/30 bg-calendar-bg-red hover:border-dynamic-light-red/30 rounded-lg border p-3 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="border-dynamic-red mt-0.5 h-5 w-5 rounded-full border-2"></div>
                      <div className="flex-1">
                        <h4 className="text-dynamic-red font-medium">
                          {t('prepare_for_team_meeting')}
                        </h4>
                        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
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
                          <span className="border-dynamic-light-green/30 bg-calendar-bg-green text-dynamic-green rounded border px-1.5 py-0.5 text-xs">
                            {t('low_priority')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-dynamic-light-green/30 bg-calendar-bg-green mt-4 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-calendar-bg-green flex h-8 w-8 items-center justify-center rounded-full">
                      <Sparkles className="text-dynamic-green h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-dynamic-green font-medium">
                        {t('ai_suggestion')}
                      </h4>
                      <p className="text-dynamic-green text-xs">
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
                  <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium">
                    <Video className="h-3 w-3" />
                    <span>{t('new_meeting')}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="border-dynamic-light-green/30 bg-calendar-bg-green rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-dynamic-green font-medium">
                        {t('team_sync')}
                      </h4>
                      <span className="bg-calendar-bg-green text-dynamic-green rounded px-2 py-0.5 text-xs">
                        {t('today_at_10_am')}
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex -space-x-2 font-semibold">
                        <div className="border-dynamic-light-green/30 bg-calendar-bg-green text-dynamic-light-green flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          A
                        </div>
                        <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-light-blue flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          B
                        </div>
                        <div className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow text-dynamic-light-yellow flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          C
                        </div>
                        <div className="border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-light-red flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          D
                        </div>
                      </div>
                      <span className="text-dynamic-blue text-xs">
                        {t('4-participants')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium">
                        <Video className="h-3 w-3" />
                        <span>{t('join_tuturuuu')}</span>
                      </button>
                      <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue rounded-md border px-3 py-1 text-xs font-medium">
                        {t('view_details')}
                      </button>
                    </div>
                  </div>

                  <div className="border-dynamic-light-red/30 bg-calendar-bg-red rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-dynamic-red font-medium">
                        {t('client_presentation')}
                      </h4>
                      <span className="bg-calendar-bg-red text-dynamic-red rounded px-2 py-0.5 text-xs">
                        {t('tomorrow_at_2_pm')}
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex -space-x-2 font-semibold">
                        <div className="border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-light-red flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          Y
                        </div>
                        <div className="border-dynamic-light-indigo/30 bg-calendar-bg-indigo text-dynamic-light-indigo flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium">
                          Z
                        </div>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {t('2-participants')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue rounded-md border px-3 py-1 text-xs font-medium">
                        {t('prepare')}
                      </button>
                      <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue rounded-md border px-3 py-1 text-xs font-medium">
                        {t('view_details')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow mt-4 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-calendar-bg-yellow flex h-8 w-8 items-center justify-center rounded-full">
                      <Sparkles className="text-dynamic-yellow h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-dynamic-yellow font-medium">
                        {t('tuturuuu_features')}
                      </h4>
                      <p className="text-dynamic-yellow text-xs">
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
                  <button className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-blue flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium">
                    <MessageSquare className="h-3 w-3" />
                    <span>{t('new_chat')}</span>
                  </button>
                </div>

                <div className="border-dynamic-light-orange/30 bg-calendar-bg-orange flex h-1/2 flex-col rounded-lg border">
                  <div className="border-dynamic-light-orange/30 border-b p-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-calendar-bg-orange flex h-8 w-8 items-center justify-center rounded-full">
                        <span className="text-dynamic-orange text-sm font-medium">
                          {t('mp')}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-dynamic-orange font-medium">
                          {t('marketing_project')}
                        </h4>
                        <p className="text-muted-foreground text-xs">
                          {t('5-members')} • {t('3-online')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto p-3">
                    <div className="flex items-start gap-2">
                      <div className="border-dynamic-light-green/30 bg-calendar-bg-green flex h-8 w-8 items-center justify-center rounded-full border">
                        <span className="text-xs font-medium">
                          {t('alex-initials')}
                        </span>
                      </div>
                      <div className="border-dynamic-light-green/30 bg-calendar-bg-green max-w-[80%] rounded-lg border p-2 text-sm">
                        <p className="text-dynamic-green text-xs font-medium">
                          {t('alex')}
                        </p>
                        <p>
                          {t(
                            'has_everyone_reviewed_the_latest_campaign_mockups'
                          )}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {t('10_15_am')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start justify-end gap-2">
                      <div className="border-dynamic-light-red/30 bg-calendar-bg-red max-w-[80%] rounded-lg border p-2 text-sm">
                        <p className="text-dynamic-red text-xs font-medium">
                          {t('you')}
                        </p>
                        <p>
                          {t(
                            'yes_ive_added_my_comments_in_the_shared_document'
                          )}
                        </p>
                        <p className="text-dynamic-red mt-1 text-xs">
                          {t('10_17_am')}
                        </p>
                      </div>
                      <div className="border-dynamic-light-red/30 bg-calendar-bg-red flex h-8 w-8 items-center justify-center rounded-full border">
                        <span className="text-xs font-medium">
                          {t('you-initials')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue flex h-8 w-8 items-center justify-center rounded-full border">
                        <span className="text-xs font-medium">
                          {t('ben-initials')}
                        </span>
                      </div>
                      <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue max-w-[80%] rounded-lg border p-2 text-sm">
                        <p className="text-dynamic-blue text-xs font-medium">
                          {t('ben')}
                        </p>
                        <p>
                          {t(
                            'ill_finish_my_review_by_eod_need_to_coordinate_with_the_design_team_first'
                          )}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {t('10_20_am')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-dynamic-light-orange/30 border-t p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={t('type_a_message')}
                        className="border-dynamic-light-orange/30 bg-calendar-bg-orange focus:ring-dynamic-orange flex-1 rounded-lg border px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                      />
                      <button className="bg-calendar-bg-orange text-dynamic-orange flex h-8 w-8 items-center justify-center rounded-full">
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
                  <button className="border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-red flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium">
                    <Mail className="h-3 w-3" />
                    <span>{t('compose')}</span>
                  </button>
                </div>

                <div className="border-dynamic-light-red/30 bg-calendar-bg-red rounded-lg border">
                  <div className="border-dynamic-light-red/30 flex items-center gap-2 border-b p-3">
                    <input
                      type="text"
                      placeholder={t('search_emails')}
                      className="border-dynamic-light-red/30 bg-calendar-bg-red focus:ring-dynamic-red flex-1 rounded-lg border px-3 py-1.5 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                    />
                    <button className="border-dynamic-light-red/30 bg-calendar-bg-red text-dynamic-red rounded-md border px-3 py-1.5 text-xs font-medium">
                      {t('filter')}
                    </button>
                  </div>

                  <div className="divide-dynamic-light-red/30 divide-y">
                    <div className="bg-calendar-bg-blue hover:bg-dynamic-light-blue/30 cursor-pointer p-3 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue flex h-8 w-8 items-center justify-center rounded-full border">
                          <span className="text-dynamic-blue text-xs font-medium">
                            {t('ac-initials')}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-dynamic-blue line-clamp-1 font-medium">
                              {t('alex_chen')}
                            </h4>
                            <span className="text-muted-foreground text-xs">
                              {t('10_30_am')}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm font-medium">
                            {t('project_update_q2_marketing_campaign')}
                          </p>
                          <p className="text-muted-foreground line-clamp-1 text-xs">
                            {t(
                              'hi_team_i_wanted_to_share_the_latest_updates_on_our_q2_marketing_campaign_weve_made_significant_progress'
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-calendar-bg-yellow hover:bg-dynamic-light-yellow/30 cursor-pointer p-3 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="border-dynamic-light-yellow/30 bg-calendar-bg-yellow flex h-8 w-8 items-center justify-center rounded-full border">
                          <span className="text-dynamic-yellow text-xs font-medium">
                            {t('st-initials')}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-dynamic-yellow line-clamp-1 font-medium">
                              {t('sarah_thompson')}
                            </h4>
                            <span className="text-muted-foreground text-xs">
                              {t('yesterday')}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm">
                            {t('client_feedback_on_proposal')}
                          </p>
                          <p className="text-muted-foreground line-clamp-1 text-xs">
                            {t(
                              'the_client_has_reviewed_our_proposal_and_has_some_feedback_overall_theyre_impressed_with_our_approach'
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-calendar-bg-green hover:bg-dynamic-light-green/30 cursor-pointer rounded-b-lg p-3 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="border-dynamic-light-green/30 bg-calendar-bg-green flex h-8 w-8 items-center justify-center rounded-full border">
                          <span className="text-dynamic-green text-xs font-medium">
                            {t('jd-initials')}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-dynamic-green line-clamp-1 font-medium">
                              {t('john_doe')}
                            </h4>
                            <span className="text-muted-foreground text-xs">
                              {t('may_12')}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm">
                            {t('meeting_follow_up_action_items')}
                          </p>
                          <p className="text-muted-foreground line-clamp-1 text-xs">
                            {t(
                              'following_our_meeting_yesterday_ive_compiled_a_list_of_action_items_for_each_team_member'
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-dynamic-light-blue/30 bg-calendar-bg-blue mt-4 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-calendar-bg-blue flex h-8 w-8 items-center justify-center rounded-full">
                      <Sparkles className="text-dynamic-blue h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-dynamic-blue font-medium">
                        {t('smart_mail_features')}
                      </h4>
                      <p className="text-dynamic-blue text-xs">
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
