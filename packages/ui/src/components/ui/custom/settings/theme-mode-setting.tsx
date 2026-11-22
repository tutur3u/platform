'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import type { ReactNode } from 'react';
import { ThemeModePreview } from './theme-mode-preview';

const THEME_MODES = ['light', 'dark', 'system'] as const;

/**
 * Light, Dark and System theme cards. The choice is stored on this device by
 * the app's theme provider, so it works without an account.
 */
export function ThemeModeSetting({
  description,
  idPrefix = '',
}: {
  description?: ReactNode;
  /** Keeps radio ids unique when two pickers can mount on one page. */
  idPrefix?: string;
}) {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const labels = {
    light: t('common.light'),
    dark: t('common.dark'),
    system: t('common.system'),
  };

  return (
    <SettingItemTab
      layout="stacked"
      title={t('common.theme')}
      description={description}
    >
      <RadioGroup
        defaultValue={theme}
        onValueChange={setTheme}
        className="grid grid-cols-3 gap-3"
      >
        {THEME_MODES.map((mode) => {
          const id = `${idPrefix}${mode}`;
          return (
            <div key={mode}>
              <RadioGroupItem value={mode} id={id} className="peer sr-only" />
              <Label
                htmlFor={id}
                className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-background p-2 font-normal hover:bg-accent hover:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-foreground peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-foreground"
              >
                <ThemeModePreview mode={mode} />
                {labels[mode]}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </SettingItemTab>
  );
}
