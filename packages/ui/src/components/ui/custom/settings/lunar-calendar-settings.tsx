'use client';

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label htmlFor="show-lunar-calendar">
            {t('show_lunar_calendar')}
          </Label>
          <p className="text-muted-foreground text-sm">
            {t('show_lunar_calendar_description')}
          </p>
        </div>
        <Switch
          id="show-lunar-calendar"
          checked={showLunar}
          onCheckedChange={setShowLunar}
        />
      </div>
    </div>
  );
}
