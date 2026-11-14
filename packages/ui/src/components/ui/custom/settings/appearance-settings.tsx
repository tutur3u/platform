'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useTransition } from 'react';
import { persistLocalePreference } from '../locale-preference';
import { VersionBadgeSetting } from '../version-badge';
import { ExperimentalUiSetting } from './experimental-ui-setting';

/**
 * Shared appearance settings with theme and language.
 * For app-specific extensions (e.g., calendar timezone settings),
 * wrap or extend this component in your app.
 */
export function AppearanceSettings({
  canManageVersionBadge = false,
}: {
  canManageVersionBadge?: boolean;
}) {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLocaleChange = (newLocale: string) => {
    persistLocalePreference(newLocale);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      <SettingsSection>
        <SettingItemTab
          layout="stacked"
          title={t('common.theme')}
          description="Select your preferred theme for the application."
        >
          <RadioGroup
            defaultValue={theme}
            onValueChange={setTheme}
            className="grid grid-cols-3 gap-3"
          >
            <div>
              <RadioGroupItem
                value="light"
                id="light"
                className="peer sr-only"
              />
              <Label
                htmlFor="light"
                className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-background p-2 font-normal hover:bg-accent hover:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-foreground peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-foreground"
              >
                <div className="h-14 w-full rounded-md border bg-[#ecedef] shadow-sm" />
                {t('common.light')}
              </Label>
            </div>
            <div>
              <RadioGroupItem value="dark" id="dark" className="peer sr-only" />
              <Label
                htmlFor="dark"
                className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-background p-2 font-normal hover:bg-accent hover:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-foreground peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-foreground"
              >
                <div className="h-14 w-full rounded-md border bg-slate-950 shadow-sm" />
                {t('common.dark')}
              </Label>
            </div>
            <div>
              <RadioGroupItem
                value="system"
                id="system"
                className="peer sr-only"
              />
              <Label
                htmlFor="system"
                className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-background p-2 font-normal hover:bg-accent hover:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-foreground peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-foreground"
              >
                <div className="h-14 w-full rounded-md border bg-linear-to-r from-[#ecedef] to-slate-950 shadow-sm" />
                {t('common.system')}
              </Label>
            </div>
          </RadioGroup>
        </SettingItemTab>

        <SettingItemTab
          title={t('common.language')}
          description={t('settings-account.language-description')}
        >
          <Select
            defaultValue={locale}
            onValueChange={handleLocaleChange}
            disabled={isPending}
          >
            <SelectTrigger className="w-50">
              <SelectValue placeholder={t('common.select-language')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="vi">Tieng Viet</SelectItem>
            </SelectContent>
          </Select>
        </SettingItemTab>

        <ExperimentalUiSetting />

        {canManageVersionBadge ? (
          <VersionBadgeSetting canManage={canManageVersionBadge} />
        ) : null}
      </SettingsSection>
    </div>
  );
}
