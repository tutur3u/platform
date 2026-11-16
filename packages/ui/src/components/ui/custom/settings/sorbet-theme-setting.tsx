'use client';

import {
  useUpdateUserConfig,
  useUserConfig,
} from '@tuturuuu/ui/hooks/use-user-config';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { useTranslations } from 'next-intl';
import { SettingItemTab } from '../settings-item-tab';
import {
  announceSorbetTheme,
  parseSorbetTheme,
  SORBET_PRESETS,
  SORBET_THEME_CONFIG_ID,
  serializeSorbetTheme,
} from '../sorbet-theme';
import { SorbetPresetSwatch } from './sorbet-preset-swatch';

/**
 * Palette picker for the Sorbet design, shown while it is on. The choice is
 * stored on the account and applied at once in this tab.
 */
export function SorbetThemeSetting() {
  const t = useTranslations('experimental-ui');
  const { data: stored, isLoading } = useUserConfig(SORBET_THEME_CONFIG_ID, '');
  const updateConfig = useUpdateUserConfig();
  const theme = parseSorbetTheme(stored);

  const onPresetChange = (value: string) => {
    const next = parseSorbetTheme({ ...theme, preset: value });
    announceSorbetTheme(next);
    updateConfig.mutate({
      configId: SORBET_THEME_CONFIG_ID,
      value: serializeSorbetTheme(next),
    });
  };

  return (
    <SettingItemTab layout="stacked" title={t('palette_title')}>
      <RadioGroup
        value={theme.preset}
        onValueChange={onPresetChange}
        disabled={isLoading}
        aria-label={t('palette_title')}
        className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-5"
      >
        {SORBET_PRESETS.map((preset) => {
          const id = `sorbet-preset-${preset}`;
          return (
            <div key={preset}>
              <RadioGroupItem value={preset} id={id} className="peer sr-only" />
              <Label
                htmlFor={id}
                className="flex cursor-pointer flex-col gap-2 rounded-xl border bg-background p-1.5 font-normal transition-colors hover:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-primary peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-primary motion-reduce:transition-none"
              >
                <div
                  aria-hidden
                  className="flex h-16 w-full overflow-hidden rounded-lg border"
                >
                  <SorbetPresetSwatch preset={preset} mode="light" />
                  <SorbetPresetSwatch preset={preset} mode="dark" />
                </div>
                <span className="px-1 pb-0.5 text-sm">
                  {t(`presets.${preset}`)}
                </span>
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </SettingItemTab>
  );
}
