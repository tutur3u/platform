'use client';

import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { SettingItemTab } from '../settings-item-tab';
import {
  announceSorbetUi,
  EXPERIMENTAL_SORBET_UI_CONFIG_ID,
  parseSorbetUiValue,
  SORBET_UI_DEFAULT,
} from '../sorbet-ui';
import { SorbetThemeSetting } from './sorbet-theme-setting';

/**
 * Account-wide Sorbet design switch. On by default; turning it off keeps the
 * classic design. The choice is stored on the account, so every Tuturuuu app
 * follows it. While it is on, the Sorbet palette picker follows it.
 */
export function ExperimentalUiSetting() {
  const t = useTranslations('experimental-ui');
  const { isLoading, isPending, setValue, value } = useUserBooleanConfig(
    EXPERIMENTAL_SORBET_UI_CONFIG_ID,
    SORBET_UI_DEFAULT,
    { parse: parseSorbetUiValue }
  );

  const onChange = (enabled: boolean) => {
    setValue(enabled);
    announceSorbetUi(enabled);
  };

  return (
    <>
      <SettingItemTab
        title={t('setting_title')}
        description={t('setting_description')}
      >
        <Switch
          aria-label={t('setting_toggle_label')}
          // Extends the touch target to 44px without resizing the switch.
          className="relative after:absolute after:-inset-3"
          checked={value}
          disabled={isLoading || isPending}
          onCheckedChange={onChange}
        />
      </SettingItemTab>
      {value && <SorbetThemeSetting />}
    </>
  );
}
