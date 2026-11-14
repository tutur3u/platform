'use client';

import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Badge } from '@tuturuuu/ui/badge';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { SettingItemTab } from '../settings-item-tab';
import {
  announceSorbetUi,
  EXPERIMENTAL_SORBET_UI_CONFIG_ID,
} from '../sorbet-ui';

/**
 * Account-wide opt-in to the experimental Sorbet design. Off by default; the
 * choice is stored on the account, so every Tuturuuu app follows it.
 */
export function ExperimentalUiSetting() {
  const t = useTranslations('experimental-ui');
  const { isLoading, isPending, setValue, value } = useUserBooleanConfig(
    EXPERIMENTAL_SORBET_UI_CONFIG_ID,
    false
  );

  const onChange = (enabled: boolean) => {
    setValue(enabled);
    announceSorbetUi(enabled);
  };

  return (
    <SettingItemTab
      title={
        <span className="inline-flex items-center gap-2">
          {t('setting_title')}
          <Badge variant="outline">{t('badge')}</Badge>
        </span>
      }
      description={t('setting_description')}
    >
      <Switch
        aria-label={t('setting_toggle_label')}
        checked={value}
        disabled={isLoading || isPending}
        onCheckedChange={onChange}
      />
    </SettingItemTab>
  );
}
