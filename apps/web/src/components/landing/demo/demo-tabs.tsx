'use client';

import {
  ArrowRight,
  BarChart3,
  Bot,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  ListChecks,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
  TrendingUp,
  User,
  Users,
  Video,
  Zap,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CalendarGridDemo } from './calendar-grid-demo';
import { KanbanDemo } from './kanban-demo';

const tabs = [
  {
    id: 'tasks',
    icon: CheckCircle2,
    indicatorClass: 'bg-dynamic-light-green',
  },
  { id: 'calendar', icon: Calendar, indicatorClass: 'bg-dynamic-light-blue' },
  { id: 'meeting', icon: Video, indicatorClass: 'bg-dynamic-light-orange' },
  { id: 'chat', icon: Bot, indicatorClass: 'bg-dynamic-light-purple' },
  { id: 'analytics', icon: BarChart3, indicatorClass: 'bg-dynamic-light-cyan' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function DemoTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('tasks');
  const t = useTranslations('landing.demo');

  return (
    <div className="overflow-hidden rounded-xl border border-foreground/10 bg-background/50 backdrop-blur-sm">
      {/* Tab Navigation */}
      <div className="flex border-foreground/5 border-b bg-foreground/[0.02]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex flex-1 items-center justify-center gap-2 px-4 py-3 font-medium text-sm transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-foreground/50 hover:text-foreground/70'
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t(`tabs.${tab.id}`)}</span>
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className={cn(
                    'absolute inset-x-0 bottom-0 h-0.5',
                    tab.indicatorClass
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'tasks' && <TasksDemo key="tasks" />}
          {activeTab === 'calendar' && <CalendarDemo key="calendar" />}
          {activeTab === 'meeting' && <VideoMeetingDemo key="meeting" />}
          {activeTab === 'chat' && <ChatDemo key="chat" />}
          {activeTab === 'analytics' && <AnalyticsDemo key="analytics" />}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TasksDemo() {
  const t = useTranslations('landing.demo.taskManagement');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Kanban board view */}
      <div className="overflow-hidden rounded-lg">
        <KanbanDemo />
      </div>

      {/* AI Insight */}
      <div className="rounded-lg bg-calendar-bg-green p-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-light-green" />
          <div>
            <div className="mb-1 font-medium text-sm">
              {t('aiInsight.title')}
            </div>
            <p className="text-foreground/60 text-xs">
              {t('aiInsight.description')}
            </p>
          </div>
        </div>
      </div>

      <Button variant="outline" className="w-full" asChild>
        <Link href="/onboarding">
          {t('cta')}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </motion.div>
  );
}

function CalendarDemo() {
  const t = useTranslations('landing.demo.calendar');

  const events = [
    {
      time: t('event1.time'),
      period: t('event1.period'),
      title: t('event1.title'),
      meta: t('event1.meta'),
      bgClass:
        'bg-calendar-bg-purple hover:ring-1 hover:ring-dynamic-light-purple/50',
      textClass: 'text-dynamic-light-purple',
      borderClass: 'border-dynamic-light-purple',
    },
    {
      time: t('event2.time'),
      period: t('event2.period'),
      title: t('event2.title'),
      meta: t('event2.meta'),
      bgClass:
        'bg-calendar-bg-green hover:ring-1 hover:ring-dynamic-light-green/50',
      textClass: 'text-dynamic-light-green',
      borderClass: 'border-dynamic-light-green',
    },
    {
      time: t('event3.time'),
      period: t('event3.period'),
      title: t('event3.title'),
      meta: t('event3.meta'),
      bgClass:
        'bg-calendar-bg-orange hover:ring-1 hover:ring-dynamic-light-orange/50',
      textClass: 'text-dynamic-light-orange',
      borderClass: 'border-dynamic-light-orange',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Mobile: Event list view */}
      <div className="md:hidden">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-medium text-sm">{t('todaySchedule')}</span>
          <Badge
            variant="secondary"
            className="border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-light-blue text-xs"
          >
            {t('eventCount')}
          </Badge>
        </div>

        <div className="space-y-2">
          {events.map((event, index) => (
            <div
              key={index}
              className={cn(
                'flex gap-3 rounded-lg p-3 transition-colors',
                event.bgClass
              )}
            >
              <div className="shrink-0 text-center">
                <div className={cn('font-semibold text-xs', event.textClass)}>
                  {event.time}
                </div>
                <div className="text-[10px] text-foreground/50">
                  {event.period}
                </div>
              </div>
              <div
                className={cn(
                  'min-w-0 flex-1 border-l-2 pl-3',
                  event.borderClass
                )}
              >
                <div className="font-medium text-sm">{event.title}</div>
                <div className="flex items-center gap-1 text-foreground/50 text-xs">
                  <Users className="h-3 w-3" />
                  {event.meta}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: Week grid view */}
      <div className="hidden md:block">
        <CalendarGridDemo />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-dynamic-light-green/20 bg-calendar-bg-green p-3 text-center">
          <div className="mb-1 font-bold text-dynamic-light-green text-xl">
            {t('stats.focusTime.value')}
          </div>
          <div className="text-foreground/60 text-xs">
            {t('stats.focusTime.label')}
          </div>
        </div>
        <div className="rounded-lg border border-dynamic-light-blue/20 bg-calendar-bg-blue p-3 text-center">
          <div className="mb-1 font-bold text-dynamic-light-blue text-xl">
            {t('stats.optimized.value')}
          </div>
          <div className="text-foreground/60 text-xs">
            {t('stats.optimized.label')}
          </div>
        </div>
      </div>

      <Button variant="outline" className="w-full" asChild>
        <Link href="/onboarding">
          {t('cta')}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </motion.div>
  );
}

function ChatDemo() {
  const t = useTranslations('landing.demo.aiChat');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Chat Container */}
      <div className="overflow-hidden rounded-xl border border-border/30 bg-background/80 shadow-sm backdrop-blur-sm">
        {/* Chat Header */}
        <div className="flex items-center gap-3 border-border/20 border-b bg-calendar-bg-purple p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-light-purple text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Mira</div>
            <div className="flex items-center gap-1 text-[10px] text-dynamic-light-green">
              <span className="h-1.5 w-1.5 rounded-full bg-dynamic-light-green" />
              {t('status')}
            </div>
          </div>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Messages */}
        <div className="max-h-[220px] space-y-3 overflow-y-auto p-3">
          {/* User Message */}
          <div className="flex items-end justify-end gap-2">
            <div className="max-w-[75%] rounded-2xl rounded-br-md bg-calendar-bg-blue px-3 py-2 text-dynamic-light-blue">
              <p className="text-sm">{t('userMessage1')}</p>
            </div>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-dynamic-light-blue text-white">
              <User className="h-3 w-3" />
            </div>
          </div>

          {/* AI Response */}
          <div className="flex items-end gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-dynamic-light-purple text-white">
              <Bot className="h-3 w-3" />
            </div>
            <div className="max-w-[75%] rounded-2xl rounded-bl-md border border-border/20 bg-muted/30 px-3 py-2">
              <p className="mb-2 text-sm">{t('aiResponse1.intro')}</p>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dynamic-light-green" />
                  <span>{t('aiResponse1.item1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dynamic-light-green" />
                  <span>{t('aiResponse1.item2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dynamic-light-green" />
                  <span>{t('aiResponse1.item3')}</span>
                </li>
              </ul>
            </div>
          </div>

          {/* User Message 2 */}
          <div className="flex items-end justify-end gap-2">
            <div className="max-w-[75%] rounded-2xl rounded-br-md bg-calendar-bg-blue px-3 py-2 text-dynamic-light-blue">
              <p className="text-sm">{t('userMessage2')}</p>
            </div>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-dynamic-light-blue text-white">
              <User className="h-3 w-3" />
            </div>
          </div>

          {/* Typing Indicator */}
          <div className="flex items-end gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-dynamic-light-purple text-white">
              <Bot className="h-3 w-3" />
            </div>
            <div className="rounded-2xl rounded-bl-md border border-border/20 bg-muted/30 px-4 py-2">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-dynamic-light-purple/60 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-dynamic-light-purple/60 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-dynamic-light-purple/60 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="border-border/20 border-t bg-muted/10 p-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border/30 bg-background px-3 py-2">
              <input
                type="text"
                placeholder={t('inputPlaceholder')}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                disabled
              />
            </div>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-dynamic-light-purple text-white shadow-sm transition-colors hover:bg-dynamic-light-purple/90"
              disabled
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant="secondary"
          className="cursor-pointer border border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-light-blue transition-colors hover:ring-1 hover:ring-dynamic-light-blue/50"
        >
          <Calendar className="mr-1 h-3 w-3" />
          {t('quickActions.tasks')}
        </Badge>
        <Badge
          variant="secondary"
          className="cursor-pointer border border-dynamic-light-green/30 bg-calendar-bg-green text-dynamic-light-green transition-colors hover:ring-1 hover:ring-dynamic-light-green/50"
        >
          <Clock className="mr-1 h-3 w-3" />
          {t('quickActions.reminder')}
        </Badge>
        <Badge
          variant="secondary"
          className="cursor-pointer border border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-light-purple transition-colors hover:ring-1 hover:ring-dynamic-light-purple/50"
        >
          <Sparkles className="mr-1 h-3 w-3" />
          {t('quickActions.summary')}
        </Badge>
      </div>

      <Button variant="outline" className="w-full" asChild>
        <Link href="/onboarding">
          {t('cta')}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </motion.div>
  );
}

function AnalyticsDemo() {
  const t = useTranslations('landing.demo.analytics');

  const metrics = [
    {
      icon: TrendingUp,
      label: t('metrics.tasks.label'),
      value: t('metrics.tasks.value'),
      change: t('metrics.tasks.change'),
      cardClass: 'border-dynamic-light-green/20 bg-calendar-bg-green',
      iconClass: 'text-dynamic-light-green',
      valueClass: 'text-dynamic-light-green',
      up: true,
    },
    {
      icon: Clock,
      label: t('metrics.focus.label'),
      value: t('metrics.focus.value'),
      change: t('metrics.focus.change'),
      cardClass: 'border-dynamic-light-blue/20 bg-calendar-bg-blue',
      iconClass: 'text-dynamic-light-blue',
      valueClass: 'text-dynamic-light-blue',
      up: true,
    },
    {
      icon: Users,
      label: t('metrics.meetings.label'),
      value: t('metrics.meetings.value'),
      change: t('metrics.meetings.change'),
      cardClass: 'border-dynamic-light-purple/20 bg-calendar-bg-purple',
      iconClass: 'text-dynamic-light-purple',
      valueClass: 'text-dynamic-light-purple',
      up: false,
    },
    {
      icon: Zap,
      label: t('metrics.goals.label'),
      value: t('metrics.goals.value'),
      change: t('metrics.goals.subtitle'),
      cardClass: 'border-dynamic-light-orange/20 bg-calendar-bg-orange',
      iconClass: 'text-dynamic-light-orange',
      valueClass: 'text-dynamic-light-orange',
      up: true,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((metric, index) => (
          <div
            key={index}
            className={cn('rounded-lg border p-3', metric.cardClass)}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <metric.icon className={cn('h-4 w-4', metric.iconClass)} />
              <span className="font-medium text-xs">{metric.label}</span>
            </div>
            <div className={cn('font-bold text-xl', metric.valueClass)}>
              {metric.value}
            </div>
            <div className="flex items-center gap-1 text-foreground/60 text-xs">
              <ArrowRight
                className={cn(
                  'h-3 w-3',
                  metric.up ? '-rotate-45' : 'rotate-45'
                )}
              />
              {metric.change}
            </div>
          </div>
        ))}
      </div>

      {/* Productivity Score */}
      <div className="rounded-lg border border-dynamic-light-cyan/20 bg-calendar-bg-cyan p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium text-sm">
            {t('productivityScore.title')}
          </span>
          <Badge
            variant="secondary"
            className="border-dynamic-light-cyan/30 bg-calendar-bg-cyan text-dynamic-light-cyan"
          >
            {t('productivityScore.badge')}
          </Badge>
        </div>
        <div className="mb-2 h-2 overflow-hidden rounded-full bg-dynamic-light-cyan/20">
          <div className="h-full w-[87%] rounded-full bg-gradient-to-r from-dynamic-light-cyan to-dynamic-light-blue" />
        </div>
        <div className="flex justify-between text-foreground/60 text-xs">
          <span>{t('productivityScore.value')}</span>
          <span>{t('productivityScore.rank')}</span>
        </div>
      </div>

      <Button variant="outline" className="w-full" asChild>
        <Link href="/onboarding">
          {t('cta')}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </motion.div>
  );
}

function VideoMeetingDemo() {
  const t = useTranslations('landing.demo.videoMeeting');

  const participants = [
    {
      name: t('participants.you'),
      avatar: 'Y',
      speaking: true,
      bgClass: 'bg-dynamic-light-blue',
    },
    {
      name: t('participants.sarah'),
      avatar: 'S',
      speaking: false,
      bgClass: 'bg-dynamic-light-purple',
    },
    {
      name: t('participants.alex'),
      avatar: 'A',
      speaking: false,
      bgClass: 'bg-dynamic-light-green',
    },
    {
      name: t('participants.mira'),
      avatar: 'M',
      speaking: false,
      bgClass: 'bg-dynamic-light-orange',
      isAI: true,
    },
  ];

  const aiFeatures = [
    {
      icon: FileText,
      title: t('aiFeatures.liveNotes.title'),
      description: t('aiFeatures.liveNotes.description'),
      bgClass: 'bg-calendar-bg-blue',
      iconClass: 'text-dynamic-light-blue',
    },
    {
      icon: ListChecks,
      title: t('aiFeatures.actionItems.title'),
      description: t('aiFeatures.actionItems.description'),
      bgClass: 'bg-calendar-bg-green',
      iconClass: 'text-dynamic-light-green',
    },
    {
      icon: Sparkles,
      title: t('aiFeatures.summary.title'),
      description: t('aiFeatures.summary.description'),
      bgClass: 'bg-calendar-bg-purple',
      iconClass: 'text-dynamic-light-purple',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Video Meeting Container */}
      <div className="overflow-hidden rounded-xl border border-border/30 bg-background/80 shadow-sm backdrop-blur-sm">
        {/* Meeting Header */}
        <div className="flex items-center justify-between border-border/20 border-b bg-calendar-bg-orange p-2 sm:p-3">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-dynamic-light-orange" />
            <span className="font-semibold text-xs sm:text-sm">
              {t('header.title')}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 text-[10px] sm:text-xs">
              <Circle className="h-2 w-2 animate-pulse fill-dynamic-red text-dynamic-red" />
              <span className="xs:inline hidden text-dynamic-red">
                {t('header.recording')}
              </span>
            </div>
            <span className="text-[10px] text-foreground/60 sm:text-xs">
              {t('duration')}
            </span>
            <div className="hidden items-center gap-1 text-foreground/60 text-xs sm:flex">
              <Users className="h-3 w-3" />
              {t('header.participants')}
            </div>
          </div>
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-4 sm:gap-2 sm:p-3">
          {participants.map((participant, index) => (
            <div
              key={index}
              className={cn(
                'relative aspect-[4/3] rounded-lg border border-border/20 bg-muted/20 sm:aspect-video',
                participant.speaking && 'ring-2 ring-dynamic-light-green'
              )}
            >
              {/* Participant Avatar */}
              <div className="flex h-full flex-col items-center justify-center gap-0.5 sm:gap-1">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm text-white sm:h-10 sm:w-10 sm:text-base',
                    participant.bgClass
                  )}
                >
                  {participant.isAI ? (
                    <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : (
                    participant.avatar
                  )}
                </div>
                <span className="text-[10px] sm:text-xs">
                  {participant.name}
                </span>
                {participant.isAI && (
                  <span className="rounded-full bg-dynamic-light-orange/20 px-1.5 py-0.5 text-[8px] text-dynamic-light-orange sm:px-2 sm:text-[10px]">
                    AI
                  </span>
                )}
              </div>
              {/* Speaking indicator */}
              {participant.speaking && (
                <div className="absolute bottom-1 left-1 flex items-center gap-0.5 sm:bottom-2 sm:left-2 sm:gap-1">
                  <Mic className="h-2.5 w-2.5 text-dynamic-light-green sm:h-3 sm:w-3" />
                  <div className="flex gap-0.5">
                    <span className="h-1.5 w-0.5 animate-pulse rounded-full bg-dynamic-light-green sm:h-2" />
                    <span className="h-2 w-0.5 animate-pulse rounded-full bg-dynamic-light-green [animation-delay:100ms] sm:h-3" />
                    <span className="h-1.5 w-0.5 animate-pulse rounded-full bg-dynamic-light-green [animation-delay:200ms] sm:h-2" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Live Transcript */}
        <div className="border-border/20 border-t bg-muted/10 p-2 sm:p-3">
          <div className="mb-2 flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-xs">{t('transcript.title')}</span>
          </div>
          <div className="space-y-1.5 text-xs sm:space-y-2 sm:text-sm">
            <div className="flex gap-2">
              <span className="shrink-0 font-semibold text-dynamic-light-purple">
                Sarah:
              </span>
              <span className="line-clamp-2 text-foreground/70 sm:line-clamp-none">
                {t('transcript.sarah')}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="shrink-0 font-semibold text-dynamic-light-green">
                Alex:
              </span>
              <span className="line-clamp-2 text-foreground/70 sm:line-clamp-none">
                {t('transcript.alex')}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="shrink-0 font-semibold text-dynamic-light-orange">
                Mira:
              </span>
              <span className="line-clamp-2 text-foreground/70 sm:line-clamp-none">
                {t('transcript.mira')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Features */}
      <div className="grid grid-cols-1 xs:grid-cols-3 gap-2">
        {aiFeatures.map((feature, index) => (
          <div
            key={index}
            className={cn(
              'flex xs:flex-col items-center gap-3 xs:gap-1 rounded-lg p-2.5 xs:text-center transition-colors',
              feature.bgClass
            )}
          >
            <feature.icon
              className={cn('xs:mx-auto h-5 w-5 shrink-0', feature.iconClass)}
            />
            <div className="flex-1 xs:flex-none">
              <div className="font-medium text-xs">{feature.title}</div>
              <div className="text-[10px] text-foreground/60 leading-tight">
                {feature.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* AI Insights Bar */}
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg bg-calendar-bg-orange p-2">
        <Badge
          variant="secondary"
          className="border-dynamic-light-orange/30 bg-background/50 text-[10px] text-dynamic-light-orange"
        >
          <Sparkles className="mr-1 h-3 w-3" />
          {t('insights.topics')}
        </Badge>
        <Badge
          variant="secondary"
          className="border-dynamic-light-green/30 bg-background/50 text-[10px] text-dynamic-light-green"
        >
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {t('insights.actionItems')}
        </Badge>
        <Badge
          variant="secondary"
          className="border-dynamic-light-blue/30 bg-background/50 text-[10px] text-dynamic-light-blue"
        >
          <TrendingUp className="mr-1 h-3 w-3" />
          {t('insights.sentiment')}
        </Badge>
      </div>

      <Button variant="outline" className="w-full" asChild>
        <Link href="/onboarding">
          {t('cta')}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </motion.div>
  );
}
