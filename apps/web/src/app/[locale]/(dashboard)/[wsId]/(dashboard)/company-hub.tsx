'use client';

import {
  Building2,
  Cake,
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Gift,
  Lightbulb,
  PartyPopper,
  Rocket,
  Sparkles,
  TrendingUp,
  Trophy,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

// Configure dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);

// ============================================================================
// Constants & Types
// ============================================================================

// Founding date: June 20, 2022 at 00:00:00 GMT+7
const FOUNDING_DATE = dayjs.tz('2022-06-20 00:00:00', 'Asia/Ho_Chi_Minh');

const QUARTERS = [
  {
    id: 'q1',
    months: [2, 3, 4],
    startMonth: 2,
    icon: Lightbulb,
    color: 'cyan',
  },
  { id: 'q2', months: [5, 6, 7], startMonth: 5, icon: Rocket, color: 'green' },
  {
    id: 'q3',
    months: [8, 9, 10],
    startMonth: 8,
    icon: TrendingUp,
    color: 'orange',
  },
  {
    id: 'q4',
    months: [11, 12, 1],
    startMonth: 11,
    icon: Trophy,
    color: 'purple',
  },
] as const;

type QuarterId = (typeof QUARTERS)[number]['id'];

interface YearInfo {
  fiscalYear: number;
  currentQuarter: QuarterId | 'january';
  quarterIndex: number;
  progressPercent: number;
  daysRemaining: number;
  daysPassed: number;
  weekInQuarter: number;
  totalWeeksInQuarter: number;
  isJanuary: boolean;
  isBirthday: boolean;
  daysUntilBirthday: number;
  isYearEndPartyMonth: boolean;
  isYearEndPartyPassed: boolean;
  daysUntilYearEndParty: number;
  companyAge: { years: number; months: number; days: number };
  currentMonth: number;
  currentDay: number;
}

interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

function calculateYearInfo(): YearInfo {
  const now = dayjs();
  const currentMonth = now.month() + 1;
  const currentDay = now.date();
  const fiscalYear = currentMonth === 1 ? now.year() - 1 : now.year();
  const isJanuary = currentMonth === 1;

  let currentQuarter: QuarterId | 'january' = 'january';
  let quarterIndex = -1;

  if (!isJanuary) {
    for (let i = 0; i < QUARTERS.length; i++) {
      const quarterMonths = QUARTERS[i]!.months as readonly number[];
      if (quarterMonths.includes(currentMonth)) {
        currentQuarter = QUARTERS[i]!.id;
        quarterIndex = i;
        break;
      }
    }
  } else {
    currentQuarter = 'q4';
    quarterIndex = 3;
  }

  const quarter = QUARTERS[quarterIndex === -1 ? 3 : quarterIndex];
  const quarterStartMonth = quarter?.startMonth ?? 2;
  let quarterStartDate = dayjs()
    .year(fiscalYear)
    .month(quarterStartMonth - 1)
    .date(1)
    .startOf('day');

  if (currentMonth === 1) {
    quarterStartDate = quarterStartDate.year(fiscalYear).month(10);
  }

  let quarterEndDate = quarterStartDate;
  if (quarterIndex === 3) {
    quarterEndDate = dayjs()
      .year(fiscalYear + 1)
      .month(1)
      .date(1)
      .startOf('day');
  } else {
    quarterEndDate = quarterStartDate.add(3, 'month');
  }

  const totalDaysInQuarter = quarterEndDate.diff(quarterStartDate, 'day');
  const totalWeeksInQuarter = Math.ceil(totalDaysInQuarter / 7);
  const daysSinceQuarterStart = now.diff(quarterStartDate, 'day');
  const weekInQuarter = Math.floor(daysSinceQuarterStart / 7) + 1;

  const fyStart = dayjs().year(fiscalYear).month(1).date(1).startOf('day');
  const fyEnd = dayjs()
    .year(fiscalYear + 1)
    .month(1)
    .date(1)
    .startOf('day');
  const totalDays = fyEnd.diff(fyStart, 'day');
  const daysPassed = now.diff(fyStart, 'day');
  const progressPercent = Math.min(
    100,
    Math.max(0, (daysPassed / totalDays) * 100)
  );
  const daysRemaining = Math.max(0, totalDays - daysPassed);

  const isBirthday = currentMonth === 6 && currentDay === 20;
  const thisYearBirthday = dayjs().month(5).date(20).startOf('day');
  let nextBirthday = thisYearBirthday;
  if (now.isAfter(thisYearBirthday) && !isBirthday) {
    nextBirthday = thisYearBirthday.add(1, 'year');
  }
  const daysUntilBirthday = isBirthday ? 0 : nextBirthday.diff(now, 'day') + 1;

  const isYearEndPartyMonth = currentMonth === 12;
  const isYearEndPartyPassed = currentMonth === 1;
  const thisYearDecember = dayjs().month(11).date(1).startOf('day');
  let nextYearEndParty = thisYearDecember;
  if (now.isAfter(thisYearDecember) && currentMonth !== 12) {
    nextYearEndParty = thisYearDecember.add(1, 'year');
  }
  const daysUntilYearEndParty = isYearEndPartyMonth
    ? 0
    : nextYearEndParty.diff(now, 'day') + 1;

  // Calculate company age using dayjs duration
  const ageDuration = dayjs.duration(now.diff(FOUNDING_DATE));
  const ageYears = Math.floor(ageDuration.asYears());
  const ageMonths = Math.floor(ageDuration.asMonths() % 12);
  const ageDays = Math.floor(ageDuration.asDays() % 30);

  return {
    fiscalYear,
    currentQuarter: isJanuary ? 'january' : currentQuarter,
    quarterIndex,
    progressPercent,
    daysRemaining,
    daysPassed,
    weekInQuarter,
    totalWeeksInQuarter,
    isJanuary,
    isBirthday,
    daysUntilBirthday,
    isYearEndPartyMonth,
    isYearEndPartyPassed,
    daysUntilYearEndParty,
    companyAge: { years: ageYears, months: ageMonths, days: ageDays },
    currentMonth,
    currentDay,
  };
}

function calculateTetCountdown(): CountdownTime | null {
  // Tết 2026: February 17, 2026 at 00:00:00 GMT+7
  const milestoneDate = dayjs.tz('2026-02-17 00:00:00', 'Asia/Ho_Chi_Minh');
  const now = dayjs();
  const diff = milestoneDate.diff(now);

  if (diff > 0) {
    const dur = dayjs.duration(diff);
    return {
      days: Math.floor(dur.asDays()),
      hours: dur.hours(),
      minutes: dur.minutes(),
      seconds: dur.seconds(),
    };
  }
  return null;
}

function calculateJapanCountdown(): CountdownTime | null {
  // Japan Trip deadline: December 31, 2026 at 23:59:59 GMT+7
  const milestoneDate = dayjs.tz('2026-12-31 23:59:59', 'Asia/Ho_Chi_Minh');
  const now = dayjs();
  const diff = milestoneDate.diff(now);

  if (diff > 0) {
    const dur = dayjs.duration(diff);
    return {
      days: Math.floor(dur.asDays()),
      hours: dur.hours(),
      minutes: dur.minutes(),
      seconds: dur.seconds(),
    };
  }
  return null;
}

// ============================================================================
// Sub-components
// ============================================================================

function CountdownDigit({
  value,
  label,
  subLabel,
  colorClass,
}: {
  value: number;
  label: string;
  subLabel: string;
  colorClass: string;
}) {
  return (
    <div className="group/digit flex flex-col items-center gap-1">
      <div
        className={cn(
          'relative flex h-12 w-12 items-center justify-center rounded-xl border-2 shadow-lg transition-all duration-300 sm:h-14 sm:w-14',
          'hover:scale-105 hover:shadow-xl',
          colorClass
        )}
      >
        <span className="font-black text-xl tabular-nums sm:text-2xl">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <div className="flex flex-col items-center">
        <span className="font-bold text-[9px] uppercase tracking-wider opacity-80 sm:text-[10px]">
          {label}
        </span>
        <span className="text-[8px] opacity-60 sm:text-[9px]">{subLabel}</span>
      </div>
    </div>
  );
}

function CountdownSeparator({ colorClass }: { colorClass: string }) {
  return (
    <span
      className={cn(
        'self-start pt-4 font-black text-lg opacity-40',
        colorClass
      )}
    >
      :
    </span>
  );
}

function TetCountdownCard() {
  const t = useTranslations('dashboard.tet_countdown');
  const [timeLeft, setTimeLeft] = useState(calculateTetCountdown());

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(calculateTetCountdown()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!timeLeft) {
    return (
      <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-red/30 bg-linear-to-br from-dynamic-red/10 via-dynamic-orange/5 to-dynamic-yellow/10 p-4">
        <div className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="text-2xl">🎆</span>
            <span className="bg-linear-to-r from-dynamic-red via-dynamic-orange to-dynamic-yellow bg-clip-text font-black text-lg text-transparent">
              {t('complete_title')}
            </span>
            <span className="text-2xl">🎆</span>
          </div>
          <p className="text-dynamic-red/70 text-sm">
            {t('complete_subtitle')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-red/30 bg-linear-to-br from-dynamic-red/10 via-dynamic-orange/5 to-dynamic-yellow/10 p-4 backdrop-blur-sm">
      {/* Decorative elements */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-2 left-4 h-16 w-16 animate-pulse rounded-full bg-dynamic-yellow/10 blur-2xl" />
        <div
          className="absolute right-4 bottom-2 h-16 w-16 animate-pulse rounded-full bg-dynamic-red/10 blur-2xl"
          style={{ animationDelay: '0.5s' }}
        />
      </div>

      <div className="relative space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-xl">🧧</span>
          <div className="flex-1">
            <h4 className="font-bold text-dynamic-red text-sm">{t('title')}</h4>
            <p className="text-[10px] text-dynamic-red/70">{t('subtitle')}</p>
          </div>
          <Badge
            variant="outline"
            className="border-dynamic-red/30 text-[9px] text-dynamic-red"
          >
            {t('event_date')}
          </Badge>
        </div>

        {/* Countdown */}
        <div className="flex justify-center gap-1 sm:gap-2">
          <CountdownDigit
            value={timeLeft.days}
            label={t('days')}
            subLabel={t('days_viet')}
            colorClass="border-dynamic-red/40 bg-dynamic-red/15 text-dynamic-red"
          />
          <CountdownSeparator colorClass="text-dynamic-red" />
          <CountdownDigit
            value={timeLeft.hours}
            label={t('hours')}
            subLabel={t('hours_viet')}
            colorClass="border-dynamic-orange/40 bg-dynamic-orange/15 text-dynamic-orange"
          />
          <CountdownSeparator colorClass="text-dynamic-orange" />
          <CountdownDigit
            value={timeLeft.minutes}
            label={t('minutes')}
            subLabel={t('minutes_viet')}
            colorClass="border-dynamic-yellow/40 bg-dynamic-yellow/15 text-dynamic-yellow"
          />
          <CountdownSeparator colorClass="text-dynamic-yellow" />
          <CountdownDigit
            value={timeLeft.seconds}
            label={t('seconds')}
            subLabel={t('seconds_viet')}
            colorClass="border-dynamic-red/40 bg-dynamic-red/15 text-dynamic-red"
          />
        </div>

        {/* Traditional elements */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { emoji: '🌸', label: t('hoa_mai') },
            { emoji: '🧧', label: t('li_xi') },
            { emoji: '🍚', label: t('banh_chung') },
            { emoji: '🏮', label: t('den_long') },
          ].map((item, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1 rounded-lg bg-dynamic-red/5 p-2 transition-transform hover:scale-105"
            >
              <span className="text-lg">{item.emoji}</span>
              <span className="text-center font-medium text-[9px] text-dynamic-red/80">
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Wish */}
        <div className="rounded-lg bg-linear-to-r from-dynamic-red/10 to-dynamic-yellow/10 p-2.5 text-center">
          <p className="font-bold text-[10px] text-dynamic-red">
            {t('new_year_wish')} 🧧
          </p>
          <p className="mt-0.5 text-[9px] text-dynamic-orange/70">
            {t('new_year_wish_en')}
          </p>
        </div>
      </div>
    </div>
  );
}

function JapanCountdownCard() {
  const t = useTranslations('dashboard.japan_trip_countdown');
  const [timeLeft, setTimeLeft] = useState(calculateJapanCountdown());

  useEffect(() => {
    const timer = setInterval(
      () => setTimeLeft(calculateJapanCountdown()),
      1000
    );
    return () => clearInterval(timer);
  }, []);

  if (!timeLeft) {
    return (
      <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/10 via-dynamic-rose/5 to-dynamic-red/10 p-4">
        <div className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="text-2xl">🌸</span>
            <span className="bg-linear-to-r from-dynamic-pink to-dynamic-rose bg-clip-text font-black text-lg text-transparent">
              {t('complete_title')}
            </span>
            <span className="text-2xl">🎌</span>
          </div>
          <p className="text-dynamic-pink/70 text-sm">
            {t('complete_subtitle')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/10 via-dynamic-rose/5 to-transparent p-4 backdrop-blur-sm">
      {/* Decorative sakura petals */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-4 right-4 h-12 w-12 animate-pulse rounded-full bg-dynamic-pink/10 blur-xl" />
        <div
          className="absolute bottom-4 left-4 h-16 w-16 animate-pulse rounded-full bg-dynamic-rose/10 blur-2xl"
          style={{ animationDelay: '0.7s' }}
        />
      </div>

      <div className="relative space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-xl">🌸</span>
          <div className="flex-1">
            <h4 className="font-bold text-dynamic-pink text-sm">
              {t('title')}
            </h4>
            <p className="text-[10px] text-dynamic-pink/70">
              {t('subtitle_jp')}
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-dynamic-pink/30 text-[9px] text-dynamic-pink"
          >
            {t('event_date')}
          </Badge>
        </div>

        {/* Countdown */}
        <div className="flex justify-center gap-1 sm:gap-2">
          <CountdownDigit
            value={timeLeft.days}
            label={t('days')}
            subLabel={t('days_jp')}
            colorClass="border-dynamic-pink/40 bg-dynamic-pink/15 text-dynamic-pink"
          />
          <CountdownSeparator colorClass="text-dynamic-pink" />
          <CountdownDigit
            value={timeLeft.hours}
            label={t('hours')}
            subLabel={t('hours_jp')}
            colorClass="border-dynamic-rose/40 bg-dynamic-rose/15 text-dynamic-rose"
          />
          <CountdownSeparator colorClass="text-dynamic-rose" />
          <CountdownDigit
            value={timeLeft.minutes}
            label={t('minutes')}
            subLabel={t('minutes_jp')}
            colorClass="border-dynamic-pink/40 bg-dynamic-pink/15 text-dynamic-pink"
          />
          <CountdownSeparator colorClass="text-dynamic-pink" />
          <CountdownDigit
            value={timeLeft.seconds}
            label={t('seconds')}
            subLabel={t('seconds_jp')}
            colorClass="border-dynamic-rose/40 bg-dynamic-rose/15 text-dynamic-rose"
          />
        </div>

        {/* Goals */}
        <div className="space-y-1.5">
          {[
            {
              emoji: '💰',
              title: t('ultimate_goal'),
              desc: t('ultimate_goal_desc'),
            },
            { emoji: '👥', title: t('mission'), desc: t('mission_desc') },
            { emoji: '🗾', title: t('dream'), desc: t('dream_desc') },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg bg-dynamic-pink/5 p-2 transition-colors hover:bg-dynamic-pink/10"
            >
              <span className="text-base">{item.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[10px] text-dynamic-pink">
                  {item.title}
                </p>
                <p className="text-[9px] text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Motivation */}
        <div className="rounded-lg bg-linear-to-r from-dynamic-pink/10 to-dynamic-rose/10 p-2 text-center">
          <p className="font-bold text-[9px] text-dynamic-pink">
            {t('motivation')} 🌸
          </p>
        </div>
      </div>
    </div>
  );
}

function QuarterTimeline({ yearInfo }: { yearInfo: YearInfo }) {
  const t = useTranslations('dashboard.year_schedule');
  const [expandedQuarter, setExpandedQuarter] = useState<QuarterId | null>(
    null
  );

  const getQuarterStatus = (index: number) => {
    if (yearInfo.isJanuary) return index < 3 ? 'complete' : 'current';
    if (index < yearInfo.quarterIndex) return 'complete';
    if (index === yearInfo.quarterIndex) return 'current';
    return 'upcoming';
  };

  const quarterColors = [
    'bg-dynamic-blue',
    'bg-dynamic-green',
    'bg-dynamic-red',
    'bg-dynamic-orange',
  ];
  const getQuarterFill = (quarterIndex: number) => {
    const quarterStart = quarterIndex * 25;
    const quarterEnd = (quarterIndex + 1) * 25;
    const progress = yearInfo.progressPercent;
    if (progress <= quarterStart) return 0;
    if (progress >= quarterEnd) return 100;
    return ((progress - quarterStart) / 25) * 100;
  };

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-xs">
              {t('progress.through_fy', {
                percent: Math.round(yearInfo.progressPercent),
                year: yearInfo.fiscalYear,
              })}
            </span>
          </div>
          <Badge variant="secondary" className="text-[9px]">
            {t('progress.days_remaining', { count: yearInfo.daysRemaining })}
          </Badge>
        </div>

        <TooltipProvider>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/50">
            {QUARTERS.map((_, index) => {
              const fill = getQuarterFill(index);
              return (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <div className="relative h-full w-1/4 cursor-pointer">
                      <div
                        className={cn(
                          'absolute inset-0 opacity-20',
                          quarterColors[index]
                        )}
                      />
                      <div
                        className={cn(
                          'absolute inset-y-0 left-0 transition-all duration-500',
                          quarterColors[index]
                        )}
                        style={{ width: `${fill}%` }}
                      />
                      {index < 3 && (
                        <div className="absolute top-0 right-0 h-full w-px bg-background/50" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">
                      {t(`quarters.q${index + 1}` as `quarters.q1`)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t(`quarters.q${index + 1}_focus` as `quarters.q1_focus`)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        <div className="flex justify-between text-[9px] text-muted-foreground">
          {QUARTERS.map((quarter, index) => (
            <div key={quarter.id} className="flex items-center gap-1">
              <div className={cn('h-2 w-2 rounded-sm', quarterColors[index])} />
              <span>{t(`quarters.${quarter.id}`)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quarter Grid */}
      <TooltipProvider>
        <div className="grid grid-cols-4 gap-2">
          {QUARTERS.map((quarter, index) => {
            const status = getQuarterStatus(index);
            const isExpanded = expandedQuarter === quarter.id;
            const QuarterIcon = quarter.icon;

            return (
              <Tooltip key={quarter.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedQuarter(isExpanded ? null : quarter.id)
                    }
                    className={cn(
                      'group relative flex flex-col items-center rounded-xl border p-2.5 transition-all duration-200',
                      'hover:scale-[1.02] hover:shadow-md',
                      status === 'complete' &&
                        'border-dynamic-green/30 bg-dynamic-green/10',
                      status === 'current' &&
                        'border-dynamic-blue/40 bg-dynamic-blue/15 ring-1 ring-dynamic-blue/20',
                      status === 'upcoming' && 'border-border/50 bg-muted/30',
                      isExpanded && 'ring-2 ring-primary/40'
                    )}
                  >
                    <div className="mb-1 flex w-full items-center justify-between">
                      <div
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded',
                          status === 'complete' && 'bg-dynamic-green/20',
                          status === 'current' && 'bg-dynamic-blue/20',
                          status === 'upcoming' && 'bg-muted/50'
                        )}
                      >
                        {status === 'complete' ? (
                          <Check className="h-3 w-3 text-dynamic-green" />
                        ) : (
                          <QuarterIcon
                            className={cn(
                              'h-3 w-3',
                              status === 'current'
                                ? 'text-dynamic-blue'
                                : 'text-muted-foreground/50'
                            )}
                          />
                        )}
                      </div>
                      {quarter.id === 'q2' && (
                        <Cake
                          className={cn(
                            'h-3 w-3',
                            status !== 'upcoming'
                              ? 'text-dynamic-pink'
                              : 'text-dynamic-pink/50'
                          )}
                        />
                      )}
                      {quarter.id === 'q4' && (
                        <PartyPopper
                          className={cn(
                            'h-3 w-3',
                            status !== 'upcoming'
                              ? 'text-dynamic-purple'
                              : 'text-dynamic-purple/50'
                          )}
                        />
                      )}
                    </div>

                    <span
                      className={cn(
                        'font-bold text-xs',
                        status === 'complete' && 'text-dynamic-green',
                        status === 'current' && 'text-dynamic-blue',
                        status === 'upcoming' && 'text-muted-foreground/60'
                      )}
                    >
                      {t(`quarters.${quarter.id}`)}
                    </span>
                    <span
                      className={cn(
                        'text-[9px]',
                        status === 'upcoming'
                          ? 'text-muted-foreground/40'
                          : 'text-muted-foreground'
                      )}
                    >
                      {t(`quarters.${quarter.id}_months`)}
                    </span>

                    {status === 'current' && !yearInfo.isJanuary && (
                      <span className="mt-1 rounded-full bg-dynamic-blue/20 px-1.5 py-0.5 font-medium text-[8px] text-dynamic-blue">
                        {t('progress.week', { number: yearInfo.weekInQuarter })}
                      </span>
                    )}

                    <ChevronDown
                      className={cn(
                        'mt-1 h-3 w-3 text-muted-foreground/30 transition-transform',
                        isExpanded && 'rotate-180 text-muted-foreground'
                      )}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="font-medium">
                    {t(`quarters.${quarter.id}_focus`)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {status === 'complete' && t('status.completed')}
                    {status === 'current' &&
                      t('status.week_of', {
                        current: yearInfo.weekInQuarter,
                        total: yearInfo.totalWeeksInQuarter,
                      })}
                    {status === 'upcoming' && t('status.upcoming')}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Expanded Quarter Details */}
      {expandedQuarter &&
        (() => {
          const quarter = QUARTERS.find((q) => q.id === expandedQuarter);
          if (!quarter) return null;
          const QuarterIcon = quarter.icon;
          return (
            <div className="fade-in slide-in-from-top-1 animate-in rounded-xl border border-border/50 bg-muted/20 p-3 duration-200">
              <div className="flex items-center gap-2">
                <QuarterIcon className="h-4 w-4 text-dynamic-blue" />
                <h4 className="font-semibold text-sm">
                  {t(`quarters.${expandedQuarter}_focus`)}
                </h4>
                <Badge variant="outline" className="ml-auto text-[9px]">
                  {t(`quarters.${expandedQuarter}_months`)}
                </Badge>
              </div>
              <p className="mt-2 text-muted-foreground text-xs">
                {t(`quarter_details.${expandedQuarter}_desc`)}
              </p>
            </div>
          );
        })()}

      {/* January Planning Indicator */}
      {yearInfo.isJanuary && (
        <div className="flex items-center gap-2 rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/5 px-3 py-2">
          <Sparkles className="h-4 w-4 text-dynamic-purple" />
          <span className="font-medium text-dynamic-purple text-xs">
            {t('phases.january_title')}
          </span>
          <span className="text-dynamic-purple/60 text-xs">—</span>
          <span className="text-dynamic-purple/80 text-xs">
            {t('progress.you_are_here')}
          </span>
        </div>
      )}
    </div>
  );
}

function MilestonesSection({ yearInfo }: { yearInfo: YearInfo }) {
  const t = useTranslations('dashboard.year_schedule');

  return (
    <div className="space-y-3">
      {/* Birthday Section */}
      {yearInfo.isBirthday ? (
        <div className="relative overflow-hidden rounded-xl border-2 border-dynamic-pink/30 bg-linear-to-r from-dynamic-pink/10 via-dynamic-yellow/5 to-dynamic-orange/10 p-4">
          <div className="pointer-events-none absolute inset-0">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-bounce opacity-30"
                style={{
                  left: `${(i * 12 + 5) % 100}%`,
                  top: `${(i * 15 + 10) % 100}%`,
                  animationDelay: `${i * 0.15}s`,
                }}
              >
                {i % 3 === 0 ? (
                  <Sparkles className="h-3 w-3 text-dynamic-yellow" />
                ) : i % 3 === 1 ? (
                  <PartyPopper className="h-3 w-3 text-dynamic-pink" />
                ) : (
                  <Gift className="h-3 w-3 text-dynamic-orange" />
                )}
              </div>
            ))}
          </div>
          <div className="relative text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <PartyPopper className="h-5 w-5 text-dynamic-pink" />
              <span className="bg-linear-to-r from-dynamic-pink via-dynamic-orange to-dynamic-yellow bg-clip-text font-bold text-lg text-transparent">
                {t('birthday.happy_birthday', {
                  count: yearInfo.companyAge.years,
                })}
              </span>
              <Cake className="h-5 w-5 text-dynamic-orange" />
            </div>
            <p className="text-dynamic-pink/70 text-sm">
              {t('birthday.years_of_innovation', {
                count: yearInfo.companyAge.years,
              })}
            </p>
          </div>
        </div>
      ) : (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto w-full justify-between rounded-xl border border-border/50 bg-muted/20 p-3 hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/15">
                  <Cake className="h-4 w-4 text-dynamic-orange" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">{t('birthday.title')}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t('birthday.date')} • {t('birthday.founded')}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Clock className="h-3 w-3" />
                {t('birthday.days_until', {
                  count: yearInfo.daysUntilBirthday,
                })}
              </Badge>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {t('birthday.next_birthday', {
                    age: yearInfo.companyAge.years + 1,
                    year:
                      new Date().getFullYear() +
                      (yearInfo.currentMonth > 6 ? 1 : 0),
                  })}
                </span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Year End Party Section */}
      {yearInfo.isYearEndPartyMonth ? (
        <div className="relative overflow-hidden rounded-xl border-2 border-dynamic-purple/30 bg-linear-to-r from-dynamic-purple/10 via-dynamic-blue/5 to-dynamic-cyan/10 p-4">
          <div className="pointer-events-none absolute inset-0">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-bounce opacity-30"
                style={{
                  left: `${(i * 12 + 5) % 100}%`,
                  top: `${(i * 15 + 10) % 100}%`,
                  animationDelay: `${i * 0.15}s`,
                }}
              >
                {i % 3 === 0 ? (
                  <Sparkles className="h-3 w-3 text-dynamic-cyan" />
                ) : i % 3 === 1 ? (
                  <PartyPopper className="h-3 w-3 text-dynamic-purple" />
                ) : (
                  <Trophy className="h-3 w-3 text-dynamic-yellow" />
                )}
              </div>
            ))}
          </div>
          <div className="relative text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <PartyPopper className="h-5 w-5 text-dynamic-purple" />
              <span className="bg-linear-to-r from-dynamic-purple via-dynamic-blue to-dynamic-cyan bg-clip-text font-bold text-lg text-transparent">
                {t('year_end_party.celebration_title')}
              </span>
              <Trophy className="h-5 w-5 text-dynamic-yellow" />
            </div>
            <p className="text-dynamic-purple/70 text-sm">
              {t('year_end_party.celebration_message')}
            </p>
          </div>
        </div>
      ) : (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'h-auto w-full justify-between rounded-xl border border-border/50 bg-muted/20 p-3 hover:bg-muted/40',
                yearInfo.isYearEndPartyPassed && 'opacity-50'
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    yearInfo.isYearEndPartyPassed
                      ? 'bg-dynamic-green/15'
                      : 'bg-dynamic-purple/15'
                  )}
                >
                  {yearInfo.isYearEndPartyPassed ? (
                    <Check className="h-4 w-4 text-dynamic-green" />
                  ) : (
                    <PartyPopper className="h-4 w-4 text-dynamic-purple" />
                  )}
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">
                    {t('year_end_party.title')}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {t('year_end_party.subtitle')}
                  </p>
                </div>
              </div>
              {yearInfo.isYearEndPartyPassed ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-dynamic-green/30 text-[10px] text-dynamic-green"
                >
                  <Check className="h-3 w-3" />
                  {t('year_end_party.completed')}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Clock className="h-3 w-3" />
                  {t('year_end_party.days_until', {
                    count: yearInfo.daysUntilYearEndParty,
                  })}
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Trophy className="h-3.5 w-3.5 shrink-0" />
                <span>{t('year_end_party.description')}</span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Company Age */}
      <div className="flex items-center justify-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="cursor-help gap-1.5">
                <Clock className="h-3 w-3" />
                {t('company_age', {
                  years: yearInfo.companyAge.years,
                  months: yearInfo.companyAge.months,
                  days: yearInfo.companyAge.days,
                })}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{t('company_age_tooltip.title')}</p>
              <p className="text-muted-foreground text-xs">
                {t('company_age_tooltip.founded')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function CompanyHub() {
  const t = useTranslations('dashboard.year_schedule');
  const [yearInfo, setYearInfo] = useState<YearInfo>(calculateYearInfo);

  useEffect(() => {
    const timer = setInterval(() => setYearInfo(calculateYearInfo()), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card
      className={cn(
        'relative col-span-full overflow-hidden transition-all duration-300 hover:shadow-lg',
        yearInfo.isBirthday &&
          'border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/5 via-card to-dynamic-orange/5'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl shadow-sm',
                yearInfo.isBirthday
                  ? 'bg-dynamic-pink/15'
                  : 'bg-dynamic-blue/15'
              )}
            >
              <Calendar
                className={cn(
                  'h-5 w-5',
                  yearInfo.isBirthday
                    ? 'text-dynamic-pink'
                    : 'text-dynamic-blue'
                )}
              />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                Company Hub
                {yearInfo.isBirthday && (
                  <PartyPopper className="h-4 w-4 text-dynamic-pink" />
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-1 text-xs">
                <span>{t('fiscal_year', { year: yearInfo.fiscalYear })}</span>
                <ChevronRight className="h-3 w-3" />
                <span>
                  {t('fiscal_year_range', {
                    startYear: yearInfo.fiscalYear,
                    endYear: yearInfo.fiscalYear + 1,
                  })}
                </span>
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <Tabs defaultValue="fiscal" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-3">
            <TabsTrigger value="countdowns" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Countdowns</span>
            </TabsTrigger>
            <TabsTrigger value="fiscal" className="gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fiscal Year</span>
            </TabsTrigger>
            <TabsTrigger value="milestones" className="gap-1.5 text-xs">
              <Trophy className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Milestones</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="countdowns" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-2">
              <TetCountdownCard />
              <JapanCountdownCard />
            </div>
          </TabsContent>

          <TabsContent value="fiscal" className="mt-0">
            <QuarterTimeline yearInfo={yearInfo} />
          </TabsContent>

          <TabsContent value="milestones" className="mt-0">
            <MilestonesSection yearInfo={yearInfo} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
