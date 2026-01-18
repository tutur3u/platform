'use client';

import {
  Cake,
  CalendarDays,
  Check,
  ChevronDown,
  PartyPopper,
  Sparkles,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { QUARTERS, type QuarterId, type YearInfo } from './types';

const QUARTER_COLORS = [
  'bg-dynamic-blue',
  'bg-dynamic-green',
  'bg-dynamic-red',
  'bg-dynamic-orange',
];

export function QuarterTimeline({ yearInfo }: { yearInfo: YearInfo }) {
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
                          QUARTER_COLORS[index]
                        )}
                      />
                      <div
                        className={cn(
                          'absolute inset-y-0 left-0 transition-all duration-500',
                          QUARTER_COLORS[index]
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
              <div
                className={cn('h-2 w-2 rounded-sm', QUARTER_COLORS[index])}
              />
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
