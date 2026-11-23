'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { switchLocalePreference } from '../locale-preference';
import { VersionBadgeSetting, VersionInfoSetting } from '../version-badge';
import { ExperimentalUiSetting } from './experimental-ui-setting';
import { ThemeModeSetting } from './theme-mode-setting';

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
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  const handleLocaleChange = (newLocale: string) => {
    startTransition(() => switchLocalePreference(newLocale));
  };

  return (
    <div className="space-y-8">
      <SettingsSection>
        <ThemeModeSetting description="Select your preferred theme for the application." />

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

        <VersionInfoSetting showCommit={canManageVersionBadge} />
      </SettingsSection>
    </div>
  );
}
