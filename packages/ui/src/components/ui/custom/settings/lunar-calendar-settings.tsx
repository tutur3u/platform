'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { useLocale, useTranslations } from 'next-intl';
import { Label } from '../../label';
import { Switch } from '../../switch';

export function LunarCalendarSettings() {
  const t = useTranslations('settings.calendar');
  const locale = useLocale();

  const { value: showLunar, setValue: setShowLunar } = useUserBooleanConfig(
    'SHOW_LUNAR_CALENDAR',
    locale.startsWith('vi')
  );

  return (
    <SettingItemTab
      title={
        <Label htmlFor="show-lunar-calendar">{t('show_lunar_calendar')}</Label>
      }
      description={t('show_lunar_calendar_description')}
    >
      <Switch
        id="show-lunar-calendar"
        checked={showLunar}
        onCheckedChange={setShowLunar}
      />
    </SettingItemTab>
  );
}
