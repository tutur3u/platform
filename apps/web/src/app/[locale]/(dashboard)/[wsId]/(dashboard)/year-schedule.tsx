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
  Flag,
  Gift,
  Lightbulb,
  PartyPopper,
  Rocket,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Zap,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

// Tuturuuu founding date
const FOUNDING_DATE = new Date('2022-06-20T00:00:00');

// Quarter configuration with icons and colors
const QUARTERS = [
  {
    id: 'q1',
    months: [2, 3, 4],
    startMonth: 2,
    icon: Lightbulb,
    color: 'cyan',
  },
  {
    id: 'q2',
    months: [5, 6, 7],
    startMonth: 5,
    icon: Rocket,
    color: 'green',
  },
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

function calculateYearInfo(now: Date): YearInfo {
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  const fiscalYear =
    currentMonth === 1 ? now.getFullYear() - 1 : now.getFullYear();

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
  const quarterStartDate = new Date(
    currentMonth === 1 ? fiscalYear : fiscalYear,
    quarterStartMonth - 1,
    1
  );

  if (currentMonth === 1) {
    quarterStartDate.setFullYear(fiscalYear);
    quarterStartDate.setMonth(10);
  }

  // Calculate quarter end date for total weeks calculation
  const quarterEndDate = new Date(quarterStartDate);
  if (quarterIndex === 3) {
    // Q4 ends Jan 31 of next year
    quarterEndDate.setFullYear(fiscalYear + 1);
    quarterEndDate.setMonth(1);
    quarterEndDate.setDate(1);
  } else {
    // Other quarters: add 3 months
    quarterEndDate.setMonth(quarterEndDate.getMonth() + 3);
  }

  const totalDaysInQuarter = Math.floor(
    (quarterEndDate.getTime() - quarterStartDate.getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const totalWeeksInQuarter = Math.ceil(totalDaysInQuarter / 7);

  const daysSinceQuarterStart = Math.floor(
    (now.getTime() - quarterStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const weekInQuarter = Math.floor(daysSinceQuarterStart / 7) + 1;

  const fyStart = new Date(fiscalYear, 1, 1);
  const fyEnd = new Date(fiscalYear + 1, 1, 1);
  const totalDays = Math.floor(
    (fyEnd.getTime() - fyStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysPassed = Math.floor(
    (now.getTime() - fyStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  const progressPercent = Math.min(
    100,
    Math.max(0, (daysPassed / totalDays) * 100)
  );
  const daysRemaining = Math.max(0, totalDays - daysPassed);

  const isBirthday = currentMonth === 6 && currentDay === 20;
  const thisYearBirthday = new Date(now.getFullYear(), 5, 20);
  let nextBirthday = thisYearBirthday;
  if (now > thisYearBirthday && !isBirthday) {
    nextBirthday = new Date(now.getFullYear() + 1, 5, 20);
  }
  const daysUntilBirthday = isBirthday
    ? 0
    : Math.ceil(
        (nextBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

  // Year End Party calculations (December)
  const isYearEndPartyMonth = currentMonth === 12;
  // Year End Party has passed if we're in January (after December in fiscal year)
  const isYearEndPartyPassed = currentMonth === 1;
  // Year End Party is in December (month 12), we'll count days until December 1st
  const thisYearDecember = new Date(now.getFullYear(), 11, 1); // December 1st
  let nextYearEndParty = thisYearDecember;
  if (now >= thisYearDecember) {
    // If we're already in December or past it, next party is next year's December
    if (currentMonth === 12) {
      // We're in December - days until is 0 (we're in the party month)
      nextYearEndParty = thisYearDecember;
    } else {
      nextYearEndParty = new Date(now.getFullYear() + 1, 11, 1);
    }
  }
  const daysUntilYearEndParty = isYearEndPartyMonth
    ? 0
    : Math.ceil(
        (nextYearEndParty.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

  const ageMs = now.getTime() - FOUNDING_DATE.getTime();
  const ageYears = Math.floor(ageMs / (1000 * 60 * 60 * 24 * 365.25));
  const remainingAfterYears = ageMs - ageYears * 1000 * 60 * 60 * 24 * 365.25;
  const ageMonths = Math.floor(
    remainingAfterYears / (1000 * 60 * 60 * 24 * 30.44)
  );
  const remainingAfterMonths =
    remainingAfterYears - ageMonths * 1000 * 60 * 60 * 24 * 30.44;
  const ageDays = Math.floor(remainingAfterMonths / (1000 * 60 * 60 * 24));

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

// Quarter focus areas with icons - uses translation keys
type FocusItemKey =
  | 'focus_items.q1_item1'
  | 'focus_items.q1_item2'
  | 'focus_items.q1_item3'
  | 'focus_items.q2_item1'
  | 'focus_items.q2_item2'
  | 'focus_items.q2_item3'
  | 'focus_items.q3_item1'
  | 'focus_items.q3_item2'
  | 'focus_items.q3_item3'
  | 'focus_items.q4_item1'
  | 'focus_items.q4_item2'
  | 'focus_items.q4_item3';

const QUARTER_FOCUS_KEYS: Record<
  QuarterId,
  { icon: typeof Target; key: FocusItemKey }[]
> = {
  q1: [
    { icon: Target, key: 'focus_items.q1_item1' },
    { icon: Zap, key: 'focus_items.q1_item2' },
    { icon: Users, key: 'focus_items.q1_item3' },
  ],
  q2: [
    { icon: Rocket, key: 'focus_items.q2_item1' },
    { icon: TrendingUp, key: 'focus_items.q2_item2' },
    { icon: Gift, key: 'focus_items.q2_item3' },
  ],
  q3: [
    { icon: Zap, key: 'focus_items.q3_item1' },
    { icon: Flag, key: 'focus_items.q3_item2' },
    { icon: Users, key: 'focus_items.q3_item3' },
  ],
  q4: [
    { icon: Trophy, key: 'focus_items.q4_item1' },
    { icon: Gift, key: 'focus_items.q4_item2' },
    { icon: Users, key: 'focus_items.q4_item3' },
  ],
};

// Timeline Visual Component - Improved icon placement
function QuarterTimeline({
  yearInfo,
  expandedQuarter,
  onQuarterClick,
}: {
  yearInfo: YearInfo;
  expandedQuarter: QuarterId | null;
  onQuarterClick: (quarter: QuarterId) => void;
}) {
  const t = useTranslations('dashboard.year_schedule');

  const getQuarterStatus = (index: number) => {
    if (yearInfo.isJanuary) {
      return index < 3 ? 'complete' : 'current';
    }
    if (index < yearInfo.quarterIndex) return 'complete';
    if (index === yearInfo.quarterIndex) return 'current';
    return 'upcoming';
  };

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Quarter Grid */}
        <div className="grid grid-cols-4 gap-2">
          {QUARTERS.map((quarter, index) => {
            const status = getQuarterStatus(index);
            const isExpanded = expandedQuarter === quarter.id;
            const isBirthdayQuarter = quarter.id === 'q2';
            const isYearEndPartyQuarter = quarter.id === 'q4';
            const QuarterIcon = quarter.icon;

            return (
              <Tooltip key={quarter.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onQuarterClick(quarter.id)}
                    className={cn(
                      'group relative flex flex-col items-center rounded-xl border p-3 transition-all duration-200',
                      'hover:scale-[1.02] hover:shadow-md',
                      status === 'complete' &&
                        'border-dynamic-green/30 bg-dynamic-green/10',
                      status === 'current' &&
                        'border-dynamic-blue/40 bg-dynamic-blue/15 ring-1 ring-dynamic-blue/20',
                      status === 'upcoming' && 'border-border/50 bg-muted/30',
                      isExpanded && 'ring-2 ring-primary/40'
                    )}
                  >
                    {/* Status Icon - Top left corner inline */}
                    <div className="mb-1.5 flex w-full items-center justify-between">
                      <div
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-md',
                          status === 'complete' && 'bg-dynamic-green/20',
                          status === 'current' && 'bg-dynamic-blue/20',
                          status === 'upcoming' && 'bg-muted/50'
                        )}
                      >
                        {status === 'complete' ? (
                          <Check className="h-3.5 w-3.5 text-dynamic-green" />
                        ) : (
                          <QuarterIcon
                            className={cn(
                              'h-3.5 w-3.5',
                              status === 'current'
                                ? 'text-dynamic-blue'
                                : 'text-muted-foreground/50'
                            )}
                          />
                        )}
                      </div>

                      {/* Birthday indicator inline */}
                      {isBirthdayQuarter && (
                        <Cake
                          className={cn(
                            'h-3.5 w-3.5',
                            status === 'complete' || status === 'current'
                              ? 'text-dynamic-pink'
                              : 'text-dynamic-pink/50'
                          )}
                        />
                      )}

                      {/* Year End Party indicator inline */}
                      {isYearEndPartyQuarter && (
                        <PartyPopper
                          className={cn(
                            'h-3.5 w-3.5',
                            status === 'complete' || status === 'current'
                              ? 'text-dynamic-purple'
                              : 'text-dynamic-purple/50'
                          )}
                        />
                      )}
                    </div>

                    {/* Quarter Label */}
                    <span
                      className={cn(
                        'font-bold text-sm',
                        status === 'complete' && 'text-dynamic-green',
                        status === 'current' && 'text-dynamic-blue',
                        status === 'upcoming' && 'text-muted-foreground/60'
                      )}
                    >
                      {t(`quarters.${quarter.id}`)}
                    </span>

                    {/* Months */}
                    <span
                      className={cn(
                        'text-[10px]',
                        status === 'upcoming'
                          ? 'text-muted-foreground/40'
                          : 'text-muted-foreground'
                      )}
                    >
                      {t(`quarters.${quarter.id}_months`)}
                    </span>

                    {/* Current week indicator */}
                    {status === 'current' && !yearInfo.isJanuary && (
                      <span className="mt-1 rounded-full bg-dynamic-blue/20 px-2 py-0.5 font-medium text-[9px] text-dynamic-blue">
                        {t('progress.week', { number: yearInfo.weekInQuarter })}
                      </span>
                    )}

                    {/* Expand chevron */}
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

        {/* January planning indicator */}
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
    </TooltipProvider>
  );
}

// Quarter Details Component
function QuarterDetails({
  quarterId,
  isOpen,
}: {
  quarterId: QuarterId;
  isOpen: boolean;
}) {
  const t = useTranslations('dashboard.year_schedule');
  const quarter = QUARTERS.find((q) => q.id === quarterId)!;
  const focusItems = QUARTER_FOCUS_KEYS[quarterId];

  if (!isOpen) return null;

  return (
    <div className="fade-in slide-in-from-top-1 animate-in rounded-xl border border-border/50 bg-muted/20 p-4 duration-200">
      <div className="mb-3 flex items-center gap-2">
        <quarter.icon className="h-4 w-4 text-dynamic-blue" />
        <h4 className="font-semibold text-sm">
          {t(`quarters.${quarterId}_focus`)}
        </h4>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {t(`quarters.${quarterId}_months`)}
        </Badge>
      </div>
      <div className="space-y-2">
        {focusItems.map((item, index) => (
          <div key={index} className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted/50">
              <item.icon className="h-3 w-3 text-muted-foreground" />
            </div>
            <span className="text-muted-foreground text-xs leading-relaxed">
              {t(item.key)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Progress Section with Quarter Colors
function ProgressSection({ yearInfo }: { yearInfo: YearInfo }) {
  const t = useTranslations('dashboard.year_schedule');

  // Quarter colors following Tuturuuu branding: Blue, Green, Red, Orange
  const quarterColors = [
    'bg-dynamic-blue', // Q1
    'bg-dynamic-green', // Q2
    'bg-dynamic-red', // Q3
    'bg-dynamic-orange', // Q4
  ];

  // Calculate the width percentage for each quarter segment
  // Each quarter is roughly 25% of the year (3 months each)
  const quarterWidths = [25, 25, 25, 25];

  // Calculate how much of the progress falls into each quarter
  const getQuarterFill = (quarterIndex: number) => {
    const quarterStart = quarterIndex * 25;
    const quarterEnd = (quarterIndex + 1) * 25;
    const progress = yearInfo.progressPercent;

    if (progress <= quarterStart) return 0;
    if (progress >= quarterEnd) return 100;
    return ((progress - quarterStart) / 25) * 100;
  };

  // Get exact date range for each quarter
  const getQuarterDateRange = (quarterIndex: number) => {
    const fy = yearInfo.fiscalYear;
    // Quarter start/end dates based on fiscal year (Feb - Jan)
    const quarterDates = [
      // Q1: Feb 1 - Apr 30
      { start: new Date(fy, 1, 1), end: new Date(fy, 3, 30) },
      // Q2: May 1 - Jul 31
      { start: new Date(fy, 4, 1), end: new Date(fy, 6, 31) },
      // Q3: Aug 1 - Oct 31
      { start: new Date(fy, 7, 1), end: new Date(fy, 9, 31) },
      // Q4: Nov 1 - Jan 31 (next year)
      { start: new Date(fy, 10, 1), end: new Date(fy + 1, 0, 31) },
    ];
    return quarterDates[quarterIndex]!;
  };

  // Format date for display
  const formatDate = (date: Date) => {
    return t('progress.date_format', {
      month: date.toLocaleDateString('en-US', { month: 'short' }),
      day: date.getDate(),
      year: date.getFullYear(),
    });
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-border/50 bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">
            {t('progress.through_fy', {
              percent: Math.round(yearInfo.progressPercent),
              year: yearInfo.fiscalYear,
            })}
          </span>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {t('progress.days_remaining', { count: yearInfo.daysRemaining })}
        </Badge>
      </div>

      {/* Multi-colored progress bar */}
      <TooltipProvider>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/50">
          {quarterWidths.map((width, index) => {
            const fill = getQuarterFill(index);
            const quarterId = QUARTERS[index]!.id;
            const dateRange = getQuarterDateRange(index);
            return (
              <Tooltip key={index}>
                <TooltipTrigger asChild>
                  <div
                    className="relative h-full cursor-pointer"
                    style={{ width: `${width}%` }}
                  >
                    {/* Background (unfilled portion) */}
                    <div
                      className={cn(
                        'absolute inset-0 opacity-20',
                        quarterColors[index]
                      )}
                    />
                    {/* Filled portion */}
                    <div
                      className={cn(
                        'absolute inset-y-0 left-0 transition-all duration-500',
                        quarterColors[index]
                      )}
                      style={{ width: `${fill}%` }}
                    />
                    {/* Quarter separator line */}
                    {index < 3 && (
                      <div className="absolute top-0 right-0 h-full w-px bg-background/50" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{t(`quarters.${quarterId}`)}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(dateRange.start)} - {formatDate(dateRange.end)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t(`quarters.${quarterId}_focus`)}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Quarter labels under progress bar */}
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-dynamic-blue" />
          <span>Q1</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-dynamic-green" />
          <span>Q2</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-dynamic-red" />
          <span>Q3</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-dynamic-orange" />
          <span>Q4</span>
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{t('progress.fy_start', { year: yearInfo.fiscalYear })}</span>
        <span>
          {t('progress.days_completed', { count: yearInfo.daysPassed })}
        </span>
        <span>{t('progress.fy_end', { year: yearInfo.fiscalYear + 1 })}</span>
      </div>
    </div>
  );
}

// Birthday Section
function BirthdaySection({ yearInfo }: { yearInfo: YearInfo }) {
  const t = useTranslations('dashboard.year_schedule');

  if (yearInfo.isBirthday) {
    return (
      <div className="relative overflow-hidden rounded-xl border-2 border-dynamic-pink/30 bg-linear-to-r from-dynamic-pink/10 via-dynamic-yellow/5 to-dynamic-orange/10 p-4">
        {/* Confetti icons */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce opacity-30"
              style={{
                left: `${(i * 9 + 4) % 100}%`,
                top: `${(i * 13 + 8) % 100}%`,
                animationDelay: `${i * 0.12}s`,
                animationDuration: `${1.5 + (i % 3) * 0.4}s`,
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

          <p className="mt-2 text-muted-foreground text-xs">
            {t('birthday.founded')}
          </p>
        </div>
      </div>
    );
  }

  return (
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
            {t('birthday.days_until', { count: yearInfo.daysUntilBirthday })}
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
  );
}

// Year End Party Section
function YearEndPartySection({ yearInfo }: { yearInfo: YearInfo }) {
  const t = useTranslations('dashboard.year_schedule');

  if (yearInfo.isYearEndPartyMonth) {
    return (
      <div className="relative overflow-hidden rounded-xl border-2 border-dynamic-purple/30 bg-linear-to-r from-dynamic-purple/10 via-dynamic-blue/5 to-dynamic-cyan/10 p-4">
        {/* Confetti icons */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce opacity-30"
              style={{
                left: `${(i * 9 + 4) % 100}%`,
                top: `${(i * 13 + 8) % 100}%`,
                animationDelay: `${i * 0.12}s`,
                animationDuration: `${1.5 + (i % 3) * 0.4}s`,
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

          <p className="mt-2 text-muted-foreground text-xs">
            {t('year_end_party.share_plans')}
          </p>
        </div>
      </div>
    );
  }

  return (
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
              <p className="font-medium text-sm">{t('year_end_party.title')}</p>
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
  );
}

// January Section
function JanuarySection() {
  const t = useTranslations('dashboard.year_schedule');

  return (
    <div className="rounded-xl border border-dynamic-purple/20 bg-dynamic-purple/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dynamic-purple/15">
          <Sparkles className="h-4 w-4 text-dynamic-purple" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm">{t('phases.january_title')}</p>
            <Badge variant="secondary" className="text-[10px]">
              {t('status.active')}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
            {t('phases.january_desc')}
          </p>
        </div>
      </div>
    </div>
  );
}

// Company Age Badge
function CompanyAgeBadge({
  companyAge,
}: {
  companyAge: YearInfo['companyAge'];
}) {
  const t = useTranslations('dashboard.year_schedule');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="cursor-help gap-1.5">
            <Clock className="h-3 w-3" />
            {t('company_age', {
              years: companyAge.years,
              months: companyAge.months,
              days: companyAge.days,
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
  );
}

// Main Component
export default function YearSchedule() {
  const t = useTranslations('dashboard.year_schedule');
  const [yearInfo, setYearInfo] = useState<YearInfo>(() =>
    calculateYearInfo(new Date())
  );
  const [expandedQuarter, setExpandedQuarter] = useState<QuarterId | null>(
    null
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setYearInfo(calculateYearInfo(new Date()));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleQuarterClick = (quarter: QuarterId) => {
    setExpandedQuarter(expandedQuarter === quarter ? null : quarter);
  };

  return (
    <Card
      className={cn(
        'relative col-span-full overflow-hidden transition-all duration-200 hover:shadow-md',
        yearInfo.isBirthday &&
          'border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/5 via-card to-dynamic-orange/5'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl',
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
                {t('title')}
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
          <CompanyAgeBadge companyAge={yearInfo.companyAge} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <QuarterTimeline
          yearInfo={yearInfo}
          expandedQuarter={expandedQuarter}
          onQuarterClick={handleQuarterClick}
        />

        {expandedQuarter && (
          <QuarterDetails quarterId={expandedQuarter} isOpen={true} />
        )}

        <ProgressSection yearInfo={yearInfo} />

        <BirthdaySection yearInfo={yearInfo} />

        <YearEndPartySection yearInfo={yearInfo} />

        {yearInfo.isJanuary && <JanuarySection />}
      </CardContent>
    </Card>
  );
}
