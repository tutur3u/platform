'use client';

import { Info } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { HeatmapViewMode } from '@/components/settings/time-tracker/heatmap-display-settings';

interface OnboardingTipProps {
  viewMode: HeatmapViewMode;
  viewCount: number;
  onDismiss: () => void;
}

export function OnboardingTip({
  viewMode,
  viewCount,
  onDismiss,
}: OnboardingTipProps) {
  const t = useTranslations('time-tracker.heatmap');

  return (
    <div className="rounded-lg border border-blue-200/60 bg-blue-50/50 p-3 shadow-sm dark:border-blue-800/60 dark:bg-blue-950/30">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />

        <div className="flex-1 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium text-blue-900 dark:text-blue-100">
              {viewMode === 'original' && t('onboarding.originalTitle')}
              {viewMode === 'hybrid' && t('onboarding.hybridTitle')}
              {viewMode === 'calendar-only' &&
                t('onboarding.calendarOnlyTitle')}
              {viewMode === 'compact-cards' &&
                t('onboarding.compactCardsTitle')}
            </p>
            {viewCount > 0 && (
              <span className="text-blue-600 text-xs opacity-75 dark:text-blue-400">
                {t('onboarding.viewNumber', { count: viewCount + 1 })}
              </span>
            )}
          </div>

          <p className="text-blue-700 leading-relaxed dark:text-blue-300">
            {viewMode === 'original' && t('onboarding.originalDescription')}
            {viewMode === 'hybrid' && t('onboarding.hybridDescription')}
            {viewMode === 'calendar-only' &&
              t('onboarding.calendarOnlyDescription')}
            {viewMode === 'compact-cards' &&
              t('onboarding.compactCardsDescription')}
          </p>

          {viewCount >= 3 && (
            <p className="text-blue-600 text-xs opacity-80 dark:text-blue-400">
              {t('onboarding.tip')}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/50"
          onClick={onDismiss}
          title={t('onboarding.hideTooltip')}
          aria-label={t('onboarding.closeAria')}
        >
          ×
        </Button>
      </div>
    </div>
  );
}
