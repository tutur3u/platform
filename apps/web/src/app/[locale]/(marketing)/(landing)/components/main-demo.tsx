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
                type="button"
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
                type="button"
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
                type="button"
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
                type="button"
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
                type="button"
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
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-purple"
                    >
                      <ArrowRight className="h-4 w-4 rotate-180" />
                    </button>
                    <h3 className="font-medium">
                      {new Date().toLocaleDateString(locale, {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </h3>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-purple"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-dynamic-light-yellow/30 bg-calendar-bg-yellow px-3 py-1 text-xs font-medium text-dynamic-yellow"
                    >
                      {t('today')}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue"
                    >
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
                    <button
                      type="button"
                      className="rounded-md border border-dynamic-light-yellow/30 bg-calendar-bg-yellow px-3 py-1 text-xs font-medium text-dynamic-yellow"
                    >
                      {t('add_task')}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue"
                    >
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
              <div className="space-y-4">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-dynamic-light-purple/30 bg-calendar-bg-purple px-3 py-1 text-xs font-medium text-dynamic-purple"
                  >
                    {t('schedule_meeting')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue"
                  >
                    {t('instant_meeting')}
                  </button>
                </div>
                <div className="rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-blue text-white">
                      <Video className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="font-medium text-dynamic-blue">
                          {t('weekly_planning')}
                        </h4>
                        <div className="text-xs text-dynamic-blue">
                          {t('in_25_minutes')}
                        </div>
                      </div>
                      <p className="text-sm text-dynamic-blue">
                        {t('weekly_planning_attendees')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Video className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="font-medium text-muted-foreground">
                          {t('design_review')}
                        </h4>
                        <div className="text-xs text-muted-foreground">
                          {t('yesterday')}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t('design_review_attendees')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-dynamic-light-green/30 bg-calendar-bg-green p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-dynamic-green"></div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="font-medium text-dynamic-green">
                          {t('product_team')}
                        </h4>
                        <div className="text-xs text-dynamic-green">
                          {dayjs().format('h:mm A')}
                        </div>
                      </div>
                      <p className="text-sm text-dynamic-green">
                        {t('product_team_message')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-dynamic-light-purple/30 bg-calendar-bg-purple p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-dynamic-purple"></div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="font-medium text-dynamic-purple">
                          Alex
                        </h4>
                        <div className="text-xs text-dynamic-purple">
                          {dayjs().subtract(5, 'minute').format('h:mm A')}
                        </div>
                      </div>
                      <p className="text-sm text-dynamic-purple">
                        {t('alex_message')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-full border bg-background p-1.5 pl-4">
                  <input
                    placeholder={t('type_message')}
                    className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                  />
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-dynamic-light-indigo to-dynamic-light-red text-white"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'mail' && (
              <div className="space-y-4">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-dynamic-light-red/30 bg-calendar-bg-red px-3 py-1 text-xs font-medium text-dynamic-red"
                  >
                    <Sparkles className="mr-1.5 h-3 w-3" />
                    {t('ai_draft')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-dynamic-light-blue/30 bg-calendar-bg-blue px-3 py-1 text-xs font-medium text-dynamic-blue"
                  >
                    {t('compose')}
                  </button>
                </div>
                <div className="rounded-lg border border-dynamic-light-blue/30 bg-calendar-bg-blue p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-dynamic-blue"></div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="font-medium text-dynamic-blue">
                          {t('marketing_team')}
                        </h4>
                        <div className="text-xs text-dynamic-blue">
                          {dayjs().format('h:mm A')}
                        </div>
                      </div>
                      <p className="text-sm text-dynamic-blue">
                        {t('marketing_team_subject')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted"></div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="font-medium text-muted-foreground">
                          {t('john_doe')}
                        </h4>
                        <div className="text-xs text-muted-foreground">
                          {dayjs().subtract(1, 'hour').format('h:mm A')}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t('john_doe_subject')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted"></div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="font-medium text-muted-foreground">
                          {t('newsletter')}
                        </h4>
                        <div className="text-xs text-muted-foreground">
                          {t('yesterday')}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t('newsletter_subject')}
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
