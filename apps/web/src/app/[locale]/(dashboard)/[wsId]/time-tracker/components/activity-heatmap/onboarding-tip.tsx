'use client';

import { Info, X } from '@tuturuuu/icons';
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
    <div className="rounded-lg border border-dynamic-border/60 bg-dynamic-accent/20 p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-foreground" />

        <div className="flex-1 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium text-dynamic-foreground">
              {viewMode === 'original' && t('onboarding.originalTitle')}
              {viewMode === 'hybrid' && t('onboarding.hybridTitle')}
              {viewMode === 'calendar-only' &&
                t('onboarding.calendarOnlyTitle')}
              {viewMode === 'compact-cards' &&
                t('onboarding.compactCardsTitle')}
            </p>
            {viewCount > 0 && (
              <span className="text-dynamic-muted-foreground text-xs opacity-75">
                {t('onboarding.viewNumber', { count: viewCount + 1 })}
              </span>
            )}
          </div>

          <p className="text-dynamic-foreground leading-relaxed">
            {viewMode === 'original' && t('onboarding.originalDescription')}
            {viewMode === 'hybrid' && t('onboarding.hybridDescription')}
            {viewMode === 'calendar-only' &&
              t('onboarding.calendarOnlyDescription')}
            {viewMode === 'compact-cards' &&
              t('onboarding.compactCardsDescription')}
          </p>

          {viewCount >= 3 && (
            <p className="text-dynamic-muted-foreground text-xs opacity-80">
              {t('onboarding.tip')}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-dynamic-muted-foreground transition-colors hover:bg-dynamic-accent/40 hover:text-dynamic-foreground"
          onClick={onDismiss}
          title={t('onboarding.hideTooltip')}
          aria-label={t('onboarding.closeAria')}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
