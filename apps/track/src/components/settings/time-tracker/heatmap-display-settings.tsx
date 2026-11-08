'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
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

  const viewModeDescription = {
    original: t('view_descriptions.original_grid'),
    hybrid: t('view_descriptions.hybrid'),
    'calendar-only': t('view_descriptions.calendar_only'),
    'compact-cards': t('view_descriptions.compact_cards'),
  }[heatmapSettings.viewMode];

  return (
    <SettingsSection
      title={t('activity_heatmap_display')}
      description={t('heatmap_view_style_description')}
    >
      <SettingItemTab
        title={<Label htmlFor="heatmap-view">{t('heatmap_view_style')}</Label>}
        description={viewModeDescription}
        controlWidth="sm"
      >
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
              {t('view_modes.original_grid')}
            </SelectItem>
            <SelectItem value="hybrid">{t('view_modes.hybrid')}</SelectItem>
            <SelectItem value="calendar-only">
              {t('view_modes.calendar_only')}
            </SelectItem>
            <SelectItem value="compact-cards">
              {t('view_modes.compact_cards')}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingItemTab>

      <SettingItemTab
        title={<Label htmlFor="time-reference">{t('time_reference')}</Label>}
        controlWidth="sm"
      >
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
      </SettingItemTab>

      <SettingItemTab
        title={
          <Label htmlFor="onboarding-tips">{t('show_onboarding_tips')}</Label>
        }
        description={t('show_onboarding_tips_description')}
      >
        <Switch
          id="onboarding-tips"
          checked={heatmapSettings.showOnboardingTips}
          onCheckedChange={(checked) => {
            updateSettings({ showOnboardingTips: checked });
          }}
        />
      </SettingItemTab>
    </SettingsSection>
  );
}
