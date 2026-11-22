'use client';

import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { announceNavLabels, SIDEBAR_NAV_LABELS_CONFIG_ID } from '../nav-labels';
import { SettingItemTab } from '../settings-item-tab';

/**
 * Account-wide choice to caption collapsed sidebar icons. Off by default, so
 * the collapsed and expand-on-hover rails show icons with tooltips only.
 */
export function NavLabelsSetting() {
  const t = useTranslations('settings.preferences');
  const { isLoading, isPending, setValue, value } = useUserBooleanConfig(
    SIDEBAR_NAV_LABELS_CONFIG_ID,
    false
  );

  const onChange = (shown: boolean) => {
    setValue(shown);
    announceNavLabels(shown);
  };

  return (
    <SettingItemTab
      title={t('sidebar_nav_labels')}
      description={t('sidebar_nav_labels_description')}
    >
      <Switch
        aria-label={t('sidebar_nav_labels')}
        checked={value}
        disabled={isLoading || isPending}
        onCheckedChange={onChange}
      />
    </SettingItemTab>
  );
}
