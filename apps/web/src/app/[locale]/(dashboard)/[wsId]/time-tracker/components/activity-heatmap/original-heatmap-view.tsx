'use client';

import { Heatmap } from '@mantine/charts';
import { ScrollArea } from '@mantine/core';
import { formatDuration } from '@tuturuuu/hooks/utils/time-format';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { DateRangeConfig, HeatmapSize } from './types';

interface OriginalHeatmapViewProps {
  classes: Record<string, string>;
  isMobile: boolean;
  dateRangeConfig: DateRangeConfig;
  heatmapSize: HeatmapSize;
  heatmapData: Record<string, number>;
  activityMap: Map<string, { duration: number; sessions: number }>;
  timeReference: 'relative' | 'absolute' | 'smart';
  today: dayjs.Dayjs;
  navigateToHistoryDay: (value: string | dayjs.Dayjs) => void;
}

export function OriginalHeatmapView({
  classes,
  isMobile,
  dateRangeConfig,
  heatmapSize,
  heatmapData,
  activityMap,
  timeReference,
  today,
  navigateToHistoryDay,
}: OriginalHeatmapViewProps) {
  const t = useTranslations('time-tracker.heatmap');

  const renderSingleHeatmap = useCallback(
    (startDate: string, endDate: string, withOutsideDates: boolean) => (
      <Heatmap
        data={heatmapData}
        startDate={startDate}
        endDate={endDate}
        withOutsideDates={withOutsideDates}
        withMonthLabels
        withWeekdayLabels
        withTooltip
        firstDayOfWeek={1}
        monthLabels={[
          t('months.jan'),
          t('months.feb'),
          t('months.mar'),
          t('months.apr'),
          t('months.may'),
          t('months.jun'),
          t('months.jul'),
          t('months.aug'),
          t('months.sep'),
          t('months.oct'),
          t('months.nov'),
          t('months.dec'),
        ]}
        weekdayLabels={[
          t('days.sunShort'),
          t('days.monShort'),
          '',
          t('days.wedShort'),
          '',
          t('days.friShort'),
          '',
        ]}
        getTooltipLabel={({ date, value }) => {
          const activity = activityMap.get(date);
          const dateObj = dayjs(date);

          if (!activity || value === null || value === 0) {
            return `${dateObj.format('ddd, DD/MM/YYYY')} – ${t('noActivityRecorded')}`;
          }

          const parts: string[] = [dateObj.format('ddd, DD/MM/YYYY')];

          if (timeReference === 'smart') {
            parts.push(dateObj.fromNow());
          }

          parts.push(`${formatDuration(activity.duration)} ${t('tracked')}`);

          if (activity.sessions > 0) {
            parts.push(t('sessions', { count: activity.sessions }));
          }

          if (dateObj.isSame(today, 'day')) {
            parts.push(`(${t('today')})`);
          }

          return parts.join(' ');
        }}
        getRectProps={({ date }) => ({
          onClick: () => navigateToHistoryDay(date),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              navigateToHistoryDay(date);
            }
          },
          role: 'link',
          tabIndex: 0,
          style: { cursor: 'pointer' },
          'aria-label': dayjs(date).format('dddd, MMMM D, YYYY'),
        })}
        tooltipProps={{ multiline: true, w: 200 }}
        colors={[
          'var(--heatmap-level-1)',
          'var(--heatmap-level-2)',
          'var(--heatmap-level-3)',
          'var(--heatmap-level-4)',
        ]}
        rectSize={heatmapSize.rectSize}
        rectRadius={heatmapSize.rectRadius}
        gap={heatmapSize.gap}
        classNames={classes}
      />
    ),
    [
      activityMap,
      classes,
      heatmapData,
      heatmapSize.gap,
      heatmapSize.rectRadius,
      heatmapSize.rectSize,
      navigateToHistoryDay,
      t,
      timeReference,
      today,
    ]
  );

  const renderMobileHeatmaps = useCallback(() => {
    const timezoneName = dayjs.tz.guess();
    const now = dayjs().tz(timezoneName);

    const period3End = now.format('YYYY-MM-DD');
    const period3Start = now
      .subtract(2, 'month')
      .startOf('month')
      .format('YYYY-MM-DD');

    const period2End = now
      .subtract(2, 'month')
      .startOf('month')
      .subtract(1, 'day')
      .format('YYYY-MM-DD');
    const period2Start = now
      .subtract(4, 'month')
      .startOf('month')
      .format('YYYY-MM-DD');

    const period1End = now
      .subtract(4, 'month')
      .startOf('month')
      .subtract(1, 'day')
      .format('YYYY-MM-DD');
    const period1Start = now
      .subtract(6, 'month')
      .startOf('month')
      .format('YYYY-MM-DD');

    return (
      <div className="space-y-4">
        <ScrollArea type="auto">
          {renderSingleHeatmap(period1Start, period1End, false)}
        </ScrollArea>
        <ScrollArea type="auto">
          {renderSingleHeatmap(period2Start, period2End, false)}
        </ScrollArea>
        <ScrollArea type="auto">
          {renderSingleHeatmap(period3Start, period3End, false)}
        </ScrollArea>
      </div>
    );
  }, [renderSingleHeatmap]);

  return (
    <div
      className={cn(
        'w-full bg-dynamic-surface/50 p-4',
        classes.heatmapContainer,
        classes.heatmapColors
      )}
    >
      {isMobile ? (
        renderMobileHeatmaps()
      ) : (
        <ScrollArea type="auto">
          {renderSingleHeatmap(
            dateRangeConfig.startDate,
            dateRangeConfig.endDate,
            dateRangeConfig.withOutsideDates
          )}
        </ScrollArea>
      )}
    </div>
  );
}
