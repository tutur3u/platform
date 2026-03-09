'use client';

import { formatDuration } from '@tuturuuu/hooks/utils/time-format';
import { Calendar, Grid3X3, LayoutDashboard, Settings } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type {
  HeatmapSettings,
  HeatmapViewMode,
} from '@/components/settings/time-tracker/heatmap-display-settings';

interface ActivityHeatmapHeaderProps {
  totalDuration: number;
  settings: HeatmapSettings;
  classes: { heatmapColors: string };
  onViewModeChange: (viewMode: HeatmapViewMode) => void;
  onSmartTimeToggle: (checked: boolean) => void;
  onOnboardingTipsToggle: (checked: boolean) => void;
}

export function ActivityHeatmapHeader({
  totalDuration,
  settings,
  classes,
  onViewModeChange,
  onSmartTimeToggle,
  onOnboardingTipsToggle,
}: ActivityHeatmapHeaderProps) {
  const t = useTranslations('time-tracker.heatmap');

  return (
    <div className="flex flex-row gap-3 md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-dynamic-green to-dynamic-cyan shadow-lg">
          <Calendar className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-dynamic-foreground text-lg sm:text-xl">
            {t('title')}
          </h3>
          <p className="text-dynamic-muted text-sm sm:text-base">
            {totalDuration > 0
              ? t('trackedThisYear', {
                  duration: formatDuration(totalDuration),
                })
              : t('startTracking')}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 md:flex-row">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2">
              <Settings className="h-3 w-3" />
              <span className="text-xs">{t('view')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs">
              {t('settings.displayMode')}
            </DropdownMenuLabel>

            <DropdownMenuRadioGroup
              value={settings.viewMode}
              onValueChange={(value) =>
                onViewModeChange(value as HeatmapViewMode)
              }
            >
              <DropdownMenuRadioItem
                value="original"
                className="text-xs hover:cursor-pointer"
              >
                <Grid3X3 className="mr-2 h-3 w-3" />
                {t('settings.originalGrid')}
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem
                value="hybrid"
                className="text-xs hover:cursor-pointer"
              >
                <Calendar className="mr-2 h-3 w-3" />
                {t('settings.hybridView')}
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem
                value="calendar-only"
                className="text-xs hover:cursor-pointer"
              >
                <Calendar className="mr-2 h-3 w-3" />
                {t('settings.calendarOnly')}
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem
                value="compact-cards"
                className="text-xs hover:cursor-pointer"
              >
                <LayoutDashboard className="mr-2 h-3 w-3" />
                {t('settings.compactCards')}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">
              {t('settings.options')}
            </DropdownMenuLabel>

            <DropdownMenuCheckboxItem
              className="text-xs hover:cursor-pointer"
              checked={settings.timeReference === 'smart'}
              onCheckedChange={onSmartTimeToggle}
            >
              {t('settings.showSmartTimeReferences')}
            </DropdownMenuCheckboxItem>

            <DropdownMenuCheckboxItem
              className="text-xs hover:cursor-pointer"
              checked={settings.showOnboardingTips}
              onCheckedChange={onOnboardingTipsToggle}
            >
              {t('settings.showHelpfulTips')}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border border-dynamic-border/60 bg-dynamic-surface/80 px-3 py-2 text-dynamic-muted text-xs shadow-sm sm:gap-3',
            classes.heatmapColors
          )}
        >
          <span className="hidden font-medium text-dynamic-foreground sm:inline">
            {t('legend.less')}
          </span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map((intensity) => (
              <div
                key={intensity}
                className="h-2.5 w-2.5 rounded-[2px] transition-transform hover:scale-125 sm:h-3 sm:w-3"
                style={{
                  backgroundColor: `var(--heatmap-level-${intensity})`,
                }}
                title={t('legend.levelIntensity', { level: intensity })}
              />
            ))}
          </div>
          <span className="hidden font-medium text-dynamic-foreground sm:inline">
            {t('legend.more')}
          </span>
        </div>
      </div>
    </div>
  );
}
