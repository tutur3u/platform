'use client';

import '@/lib/dayjs-setup';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import dayjs from 'dayjs';
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
  const isOriginalView = settings.viewMode === 'original';
  const isCompactCardsView = settings.viewMode === 'compact-cards';

  const historyPath = useMemo(
    () => `${pathname.replace(/\/$/, '')}/history`,
    [pathname]
  );

  const navigateToHistoryDay = useCallback(
    (value: string | dayjs.Dayjs) => {
      const date = typeof value === 'string' ? dayjs(value) : value;
      const params = new URLSearchParams({
        historyPeriod: 'day',
        historyDate: formatSessionHistoryDate(date),
      });

      router.push(`${historyPath}?${params.toString()}`);
    },
    [historyPath, router]
  );

  const { heatmapData, activityMap, totalDuration, allCards } =
    useActivityAnalytics(dailyActivity, userTimezone, {
      includeHeatmapSeries: isOriginalView,
      includeCardAnalytics: isCompactCardsView,
    });

  return (
    <div
      className={`${classes.heatmapColors} relative space-y-4 overflow-visible sm:space-y-5`}
    >
      <ActivityHeatmapHeader
        totalDuration={totalDuration}
        settings={settings}
        classes={{ heatmapColors: classes.heatmapColors }}
        onViewModeChange={(viewMode: HeatmapViewMode) => {
          setSettings({ ...settings, viewMode });
        }}
        onSmartTimeToggle={(checked) => {
          setSettings((prev) => {
            const previousNonSmartReference =
              prev.timeReference === 'absolute' ||
              prev.timeReference === 'relative'
                ? prev.timeReference
                : prev.timeReferenceFallback;

            if (checked) {
              return {
                ...prev,
                timeReference: 'smart',
                timeReferenceFallback: previousNonSmartReference ?? 'relative',
              };
            }

            return {
              ...prev,
              timeReference:
                prev.timeReferenceFallback === 'absolute'
                  ? 'absolute'
                  : 'relative',
            };
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

      {settings.viewMode === 'original' &&
        (dateRangeConfig && heatmapSize ? (
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
        ) : (
          <OriginalHeatmapLoadingState />
        ))}

      {settings.viewMode === 'hybrid' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-dynamic-border/60 bg-dynamic-surface/60 p-3">
            <YearOverview
              dailyActivity={dailyActivity}
              today={today}
              userTimezone={userTimezone}
              onSelectMonth={setCurrentMonth}
            />
          </div>

          <div className="rounded-lg border border-dynamic-border/60 bg-dynamic-surface/70 p-3">
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
        <div className="rounded-lg border border-dynamic-border/60 bg-dynamic-surface/70 p-3">
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

function OriginalHeatmapLoadingState() {
  return (
    <div className="rounded-lg border border-dynamic-border/60 bg-dynamic-surface/50 p-4">
      <div className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-4 w-16 rounded-md" />
        <Skeleton className="h-4 w-20 rounded-md" />
        <Skeleton className="h-4 w-14 rounded-md" />
      </div>
      <Skeleton className="h-64 w-full rounded-md" />
    </div>
  );
}
