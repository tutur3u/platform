'use client';

import { formatDuration } from '@tuturuuu/hooks/utils/time-format';
import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  CompactHeatmapCard,
  MonthlyAggregate,
  OverallStats,
} from './types';
import { getColorClass, getIntensity } from './utils';

dayjs.extend(isoWeek);

function getMonthGridDays(monthKey: string) {
  const monthStart = dayjs(`${monthKey}-01`);
  const calendarStart = monthStart.startOf('isoWeek');
  const calendarEnd = monthStart.endOf('month').endOf('isoWeek');
  const totalDays = calendarEnd.diff(calendarStart, 'day') + 1;

  return Array.from({ length: totalDays }, (_, index) =>
    calendarStart.add(index, 'day')
  );
}

function SummaryCard({ data }: { data: OverallStats }) {
  const t = useTranslations('time-tracker.heatmap');

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-linear-to-br from-blue-50 to-indigo-50 p-3 shadow-sm transition-all hover:shadow-md dark:border-blue-800/30 dark:from-blue-950/20 dark:to-indigo-950/20">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-blue-900 text-sm dark:text-blue-100">
            {t('cards.overall')}
          </h4>
          <span className="text-blue-600 text-xs dark:text-blue-300">
            {t('monthsCount', { count: data.monthCount })}
          </span>
        </div>
        <div className="rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-700 text-xs dark:bg-blue-900/50 dark:text-blue-300">
          {data.focusScore}%
        </div>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-blue-600 dark:text-blue-400">
            {t('cards.total')}
          </div>
          <div className="font-medium text-blue-900 dark:text-blue-100">
            {formatDuration(data.totalDuration)}
          </div>
        </div>
        <div>
          <div className="text-blue-600 dark:text-blue-400">
            {t('cards.daily')}
          </div>
          <div className="font-medium text-blue-900 dark:text-blue-100">
            {formatDuration(Math.round(data.avgDaily))}
          </div>
        </div>
        <div>
          <div className="text-blue-600 dark:text-blue-400">
            {t('cards.sessions')}
          </div>
          <div className="font-medium text-blue-900 dark:text-blue-100">
            {data.totalSessions}
          </div>
        </div>
        <div>
          <div className="text-blue-600 dark:text-blue-400">
            {t('cards.days')}
          </div>
          <div className="font-medium text-blue-900 dark:text-blue-100">
            {data.activeDays}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthlyCard({
  monthKey,
  data,
  trend,
  trendValue,
}: {
  monthKey: string;
  data: MonthlyAggregate;
  trend: 'up' | 'down' | 'neutral';
  trendValue: number;
}) {
  const t = useTranslations('time-tracker.heatmap');
  const avgDailyDuration =
    data.activeDays > 0 ? data.totalDuration / data.activeDays : 0;

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-linear-to-br from-green-50 to-emerald-50 p-3 shadow-sm transition-all hover:shadow-md dark:border-green-800/30 dark:from-green-950/20 dark:to-emerald-950/20">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-green-900 text-sm dark:text-green-100">
            {data.name}
          </h4>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            {trend !== 'neutral' && (
              <span
                className={cn(
                  'font-medium text-xs',
                  trend === 'up'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {trend === 'up' ? '↗' : '↘'}
                {Math.abs(trendValue).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-green-600 dark:text-green-400">
            {t('cards.total')}
          </div>
          <div className="font-medium text-green-900 dark:text-green-100">
            {formatDuration(data.totalDuration)}
          </div>
        </div>
        <div>
          <div className="text-green-600 dark:text-green-400">
            {t('cards.daily')}
          </div>
          <div className="font-medium text-green-900 dark:text-green-100">
            {formatDuration(Math.round(avgDailyDuration))}
          </div>
        </div>
        <div>
          <div className="text-green-600 dark:text-green-400">
            {t('cards.sessions')}
          </div>
          <div className="font-medium text-green-900 dark:text-green-100">
            {data.totalSessions}
          </div>
        </div>
        <div>
          <div className="text-green-600 dark:text-green-400">
            {t('cards.days')}
          </div>
          <div className="font-medium text-green-900 dark:text-green-100">
            {data.activeDays}
          </div>
        </div>
      </div>

      <div className="mb-2">
        <div className="grid grid-cols-7 gap-px">
          {getMonthGridDays(monthKey).map((currentDay) => {
            const monthStart = dayjs(`${monthKey}-01`);

            const dayActivity = data.dates.find(
              (d) =>
                d.date.format('YYYY-MM-DD') === currentDay.format('YYYY-MM-DD')
            );

            const isCurrentMonth = currentDay.month() === monthStart.month();
            const dayIntensity = dayActivity?.activity
              ? getIntensity(dayActivity.activity.duration)
              : 0;

            return (
              <div
                key={`${monthKey}-${currentDay.format('YYYY-MM-DD')}`}
                className={cn(
                  'aspect-square rounded-[1px] transition-all',
                  isCurrentMonth
                    ? dayActivity?.activity
                      ? getColorClass(dayIntensity)
                      : 'bg-green-100 dark:bg-green-900/30'
                    : 'bg-transparent'
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UpcomingCard({ monthKey, name }: { monthKey: string; name: string }) {
  const t = useTranslations('time-tracker.heatmap');

  return (
    <div className="group relative overflow-hidden rounded-lg border border-muted/40 bg-linear-to-br from-muted/20 to-muted/10 p-3 opacity-60 backdrop-blur-sm transition-all hover:from-muted/30 hover:to-muted/20 hover:opacity-80">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-muted-foreground/80 text-sm">
            {name}
          </h4>
          <span className="text-muted-foreground/60 text-xs">
            {t('cards.nextMonth')}
          </span>
        </div>
        <div className="rounded-full bg-muted/50 px-2 py-1 font-medium text-muted-foreground/70 text-xs backdrop-blur-sm">
          {t('cards.plan')}
        </div>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 text-xs opacity-50">
        <div>
          <div className="text-muted-foreground/60">{t('cards.target')}</div>
          <div className="font-medium text-muted-foreground/60">
            {t('cards.setGoal')}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground/60">{t('cards.focus')}</div>
          <div className="font-medium text-muted-foreground/60">
            {t('cards.stayConsistent')}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground/60">{t('cards.sessions')}</div>
          <div className="font-medium text-muted-foreground/60">
            {t('cards.planAhead')}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground/60">{t('cards.growth')}</div>
          <div className="font-medium text-muted-foreground/60">
            {t('cards.keepGoing')}
          </div>
        </div>
      </div>

      <div className="mb-2 opacity-30">
        <div className="grid grid-cols-7 gap-px">
          {getMonthGridDays(monthKey).map((day) => (
            <div
              key={day.format('YYYY-MM-DD')}
              className="aspect-square rounded-[1px] bg-muted/50"
            />
          ))}
        </div>
      </div>

      <div className="border-muted/30 border-t pt-2">
        <p className="text-muted-foreground/60 text-xs">
          {t('cards.keepMomentum')}
        </p>
      </div>
    </div>
  );
}

function GettingStartedCard() {
  const t = useTranslations('time-tracker.heatmap');

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-linear-to-br from-purple-50 to-violet-50 p-3 shadow-sm transition-all hover:shadow-md dark:border-purple-800/30 dark:from-purple-950/20 dark:to-violet-950/20">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-purple-900 text-sm dark:text-purple-100">
            {t('cards.getStarted')}
          </h4>
          <span className="text-purple-600 text-xs dark:text-purple-300">
            {t('cards.beginJourney')}
          </span>
        </div>
        <div className="rounded-full bg-purple-100 px-2 py-1 font-medium text-purple-700 text-xs dark:bg-purple-900/50 dark:text-purple-300">
          {t('cards.new')}
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-purple-500" />
          <span className="text-purple-700 dark:text-purple-300">
            {t('cards.startTimerSession')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-purple-500" />
          <span className="text-purple-700 dark:text-purple-300">
            {t('cards.buildDailyHabits')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-purple-500" />
          <span className="text-purple-700 dark:text-purple-300">
            {t('cards.trackProgress')}
          </span>
        </div>
      </div>

      <div className="mt-3 border-purple-200 border-t pt-2 dark:border-purple-800">
        <p className="text-purple-700 text-xs dark:text-purple-300">
          {t('cards.pomodoroTip')}
        </p>
      </div>
    </div>
  );
}

function CompactCardsContainer({
  cards,
  currentIndex,
  setCurrentIndex,
  maxVisibleCards,
}: {
  cards: CompactHeatmapCard[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  maxVisibleCards: number;
}) {
  const t = useTranslations('time-tracker.heatmap');
  const totalCards = cards.length;
  const canScrollLeft = currentIndex > 0;
  const canScrollRight = currentIndex < totalCards - maxVisibleCards;

  const visibleCards = cards.slice(
    currentIndex,
    currentIndex + maxVisibleCards
  );

  return (
    <div className="relative">
      {totalCards > maxVisibleCards && (
        <>
          <button
            type="button"
            onClick={() => {
              if (canScrollLeft) {
                setCurrentIndex(Math.max(0, currentIndex - 1));
              }
            }}
            disabled={!canScrollLeft}
            className={cn(
              'absolute top-1/2 left-0 z-10 h-8 w-8 -translate-y-1/2 rounded-full border bg-background/80 shadow-md backdrop-blur-sm transition-all',
              canScrollLeft
                ? 'border-border text-foreground hover:border-accent-foreground/20 hover:bg-accent'
                : 'cursor-not-allowed border-muted text-muted-foreground opacity-50'
            )}
            aria-label={t('aria.previousCards')}
          >
            <ChevronLeft className="mx-auto h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (canScrollRight) {
                setCurrentIndex(
                  Math.min(totalCards - maxVisibleCards, currentIndex + 1)
                );
              }
            }}
            disabled={!canScrollRight}
            className={cn(
              'absolute top-1/2 right-0 z-10 h-8 w-8 -translate-y-1/2 rounded-full border bg-background/80 shadow-md backdrop-blur-sm transition-all',
              canScrollRight
                ? 'border-border text-foreground hover:border-accent-foreground/20 hover:bg-accent'
                : 'cursor-not-allowed border-muted text-muted-foreground opacity-50'
            )}
            aria-label={t('aria.nextCards')}
          >
            <ChevronRight className="mx-auto h-4 w-4" />
          </button>
        </>
      )}

      <div
        className={cn(
          'transition-all duration-300',
          totalCards > maxVisibleCards ? 'mx-8' : 'mx-0'
        )}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleCards.map((card, index) => {
            if (card.type === 'summary') {
              return <SummaryCard key={`summary-${index}`} data={card.data} />;
            }

            if (card.type === 'monthly') {
              return (
                <MonthlyCard
                  key={card.monthKey}
                  monthKey={card.monthKey}
                  data={card.data}
                  trend={card.trend}
                  trendValue={card.trendValue}
                />
              );
            }

            if (card.type === 'upcoming') {
              return (
                <UpcomingCard
                  key={`upcoming-${card.monthKey}`}
                  monthKey={card.monthKey}
                  name={card.name}
                />
              );
            }

            return <GettingStartedCard key={`getting-started-${index}`} />;
          })}
        </div>
      </div>

      {totalCards > maxVisibleCards && (
        <div className="mt-3 flex justify-center gap-1">
          {Array.from(
            { length: Math.ceil(totalCards / maxVisibleCards) },
            (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentIndex(i * maxVisibleCards)}
                className={cn(
                  'h-2 w-2 rounded-full transition-all',
                  Math.floor(currentIndex / maxVisibleCards) === i
                    ? 'bg-primary'
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                )}
                aria-label={t('aria.goToPage', { page: i + 1 })}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

interface CompactCardsViewProps {
  cards: CompactHeatmapCard[];
}

export function CompactCardsView({ cards }: CompactCardsViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  return (
    <CompactCardsContainer
      cards={cards}
      currentIndex={currentIndex}
      setCurrentIndex={setCurrentIndex}
      maxVisibleCards={4}
    />
  );
}
