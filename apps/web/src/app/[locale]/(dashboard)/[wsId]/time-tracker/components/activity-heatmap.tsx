'use client';

import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isoWeek from 'dayjs/plugin/isoWeek';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import 'dayjs/locale/vi';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type HeatmapSettings,
  type HeatmapViewMode,
} from '@/components/settings/time-tracker/heatmap-display-settings';
import classes from '@/style/mantine-heatmap.module.css';
import { ActivityHeatmapHeader } from './activity-heatmap/activity-heatmap-header';
import { CompactCardsView } from './activity-heatmap/compact-cards-view';
import { useActivityAnalytics } from './activity-heatmap/hooks/use-activity-analytics';
import { useHeatmapOnboarding } from './activity-heatmap/hooks/use-heatmap-onboarding';
import { useResponsiveHeatmapConfig } from './activity-heatmap/hooks/use-responsive-heatmap-config';
import {
  MonthlyCalendarView,
  YearOverview,
} from './activity-heatmap/hybrid-views';
import { OnboardingTip } from './activity-heatmap/onboarding-tip';
import { OriginalHeatmapView } from './activity-heatmap/original-heatmap-view';
import type { ActivityDay } from './activity-heatmap/types';
import { formatSessionHistoryDate } from './session-history/search-params';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);
dayjs.extend(relativeTime);
dayjs.extend(isBetween);

interface ActivityHeatmapProps {
  dailyActivity?: ActivityDay[];
}

export function ActivityHeatmap({ dailyActivity = [] }: ActivityHeatmapProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  dayjs.locale(locale);

  const [settings, setSettings] = useLocalStorage<HeatmapSettings>(
    'heatmap-settings',
    DEFAULT_SETTINGS
  );

  const { shouldShowOnboardingTips, onboardingState, handleDismissTips } =
    useHeatmapOnboarding(settings);

  const { dateRangeConfig, heatmapSize } = useResponsiveHeatmapConfig();

  const isMobile = useIsMobile();
  const userTimezone = dayjs.tz.guess();
  const today = dayjs().tz(userTimezone);
  const [currentMonth, setCurrentMonth] = useState(today);

  const historyPath = useMemo(
    () => `${pathname.replace(/\/$/, '')}/history`,
    [pathname]
  );

  const navigateToHistoryDay = useCallback(
    (value: string | dayjs.Dayjs) => {
      const date = typeof value === 'string' ? dayjs(value) : value;
      const params = new URLSearchParams({
        period: 'day',
        date: formatSessionHistoryDate(date),
      });

      router.push(`${historyPath}?${params.toString()}`);
    },
    [historyPath, router]
  );

  const { heatmapData, activityMap, totalDuration, allCards } =
    useActivityAnalytics(dailyActivity, userTimezone);

  return (
    <div className="relative space-y-4 overflow-visible sm:space-y-5">
      <ActivityHeatmapHeader
        totalDuration={totalDuration}
        settings={settings}
        classes={{ heatmapColors: classes.heatmapColors }}
        onViewModeChange={(viewMode: HeatmapViewMode) => {
          setSettings({ ...settings, viewMode });
        }}
        onSmartTimeToggle={(checked) => {
          setSettings({
            ...settings,
            timeReference:
              checked || settings.timeReference !== 'smart'
                ? 'smart'
                : 'relative',
          });
        }}
        onOnboardingTipsToggle={(checked) => {
          setSettings({
            ...settings,
            showOnboardingTips: checked,
          });
        }}
      />

      {shouldShowOnboardingTips && (
        <OnboardingTip
          viewMode={settings.viewMode}
          viewCount={onboardingState.viewCount}
          onDismiss={handleDismissTips}
        />
      )}

      {settings.viewMode === 'original' && (
        <OriginalHeatmapView
          classes={classes}
          isMobile={isMobile}
          dateRangeConfig={dateRangeConfig}
          heatmapSize={heatmapSize}
          heatmapData={heatmapData}
          activityMap={activityMap}
          timeReference={settings.timeReference}
          today={today}
          navigateToHistoryDay={navigateToHistoryDay}
        />
      )}

      {settings.viewMode === 'hybrid' && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-gray-50/50 p-3 dark:border-gray-700/60 dark:bg-gray-800/30">
            <YearOverview
              dailyActivity={dailyActivity}
              today={today}
              userTimezone={userTimezone}
              onSelectMonth={setCurrentMonth}
            />
          </div>

          <div className="rounded-lg border bg-white/50 p-3 dark:border-gray-700/60 dark:bg-gray-900/30">
            <MonthlyCalendarView
              currentMonth={currentMonth}
              onPrevMonth={() =>
                setCurrentMonth(currentMonth.subtract(1, 'month'))
              }
              onNextMonth={() => setCurrentMonth(currentMonth.add(1, 'month'))}
              dailyActivity={dailyActivity}
              userTimezone={userTimezone}
              today={today}
              timeReference={settings.timeReference}
              navigateToHistoryDay={navigateToHistoryDay}
            />
          </div>
        </div>
      )}

      {settings.viewMode === 'calendar-only' && (
        <div className="rounded-lg border bg-white/50 p-3 dark:border-gray-700/60 dark:bg-gray-900/30">
          <MonthlyCalendarView
            currentMonth={currentMonth}
            onPrevMonth={() =>
              setCurrentMonth(currentMonth.subtract(1, 'month'))
            }
            onNextMonth={() => setCurrentMonth(currentMonth.add(1, 'month'))}
            dailyActivity={dailyActivity}
            userTimezone={userTimezone}
            today={today}
            timeReference={settings.timeReference}
            navigateToHistoryDay={navigateToHistoryDay}
          />
        </div>
      )}

      {settings.viewMode === 'compact-cards' && (
        <CompactCardsView cards={allCards} />
      )}
    </div>
  );
}
