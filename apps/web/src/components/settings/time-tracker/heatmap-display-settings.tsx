'use client';

import { Calendar } from '@tuturuuu/icons';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

export type HeatmapViewMode =
  | 'original'
  | 'hybrid'
  | 'calendar-only'
  | 'compact-cards';

export interface HeatmapSettings {
  viewMode: HeatmapViewMode;
  timeReference: 'relative' | 'absolute' | 'smart';
  showOnboardingTips: boolean;
}

export const DEFAULT_SETTINGS: HeatmapSettings = {
  viewMode: 'hybrid',
  timeReference: 'smart',
  showOnboardingTips: true,
};

export function HeatmapDisplaySettings() {
  const t = useTranslations('time-tracker.heatmap_settings');

  const [heatmapSettings, setHeatmapSettings] =
    useLocalStorage<HeatmapSettings>('heatmap-settings', DEFAULT_SETTINGS);

  const updateSettings = (updates: Partial<HeatmapSettings>) => {
    setHeatmapSettings({
      ...heatmapSettings,
      ...updates,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium text-lg">
            {t('activity_heatmap_display')}
          </h3>
        </div>
        <p className="text-muted-foreground text-sm">
          {t('heatmap_view_style_description')}
        </p>
      </div>

      <div className="grid gap-6">
        <div className="space-y-2">
          <Label htmlFor="heatmap-view">{t('heatmap_view_style')}</Label>
          <Select
            value={heatmapSettings.viewMode}
            onValueChange={(
              value: 'original' | 'hybrid' | 'calendar-only' | 'compact-cards'
            ) => {
              updateSettings({ viewMode: value });
            }}
          >
            <SelectTrigger id="heatmap-view">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="original">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-sm bg-dynamic-blue" />
                  <span>{t('view_modes.original_grid')}</span>
                </div>
              </SelectItem>
              <SelectItem value="hybrid">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-sm bg-dynamic-green" />
                  <span>{t('view_modes.hybrid')}</span>
                </div>
              </SelectItem>
              <SelectItem value="calendar-only">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-sm bg-dynamic-purple" />
                  <span>{t('view_modes.calendar_only')}</span>
                </div>
              </SelectItem>
              <SelectItem value="compact-cards">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-sm bg-dynamic-orange" />
                  <span>{t('view_modes.compact_cards')}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {heatmapSettings.viewMode === 'original' &&
              t('view_descriptions.original_grid')}
            {heatmapSettings.viewMode === 'hybrid' &&
              t('view_descriptions.hybrid')}
            {heatmapSettings.viewMode === 'calendar-only' &&
              t('view_descriptions.calendar_only')}
            {heatmapSettings.viewMode === 'compact-cards' &&
              t('view_descriptions.compact_cards')}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="time-reference">{t('time_reference')}</Label>
          <Select
            value={heatmapSettings.timeReference}
            onValueChange={(value: 'relative' | 'absolute' | 'smart') => {
              updateSettings({ timeReference: value });
            }}
          >
            <SelectTrigger id="time-reference">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relative">
                {t('time_reference_modes.relative')}
              </SelectItem>
              <SelectItem value="absolute">
                {t('time_reference_modes.absolute')}
              </SelectItem>
              <SelectItem value="smart">
                {t('time_reference_modes.smart')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="onboarding-tips" className="text-base">
              {t('show_onboarding_tips')}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t('show_onboarding_tips_description')}
            </p>
          </div>
          <Switch
            id="onboarding-tips"
            checked={heatmapSettings.showOnboardingTips}
            onCheckedChange={(checked) => {
              updateSettings({ showOnboardingTips: checked });
            }}
          />
        </div>
      </div>
    </div>
  );
}
