'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

export function FormsAutosaveSettings() {
  const t = useTranslations('settings.preferences');
  const {
    value: autosaveEnabled,
    setValue: setAutosaveEnabled,
    isLoading,
    isPending,
  } = useUserBooleanConfig('FORMS_AUTOSAVE_ENABLED', true);

  return (
    <div className="space-y-8">
      <SettingItemTab
        description={t('forms_autosave_description')}
        title={t('forms_autosave')}
      >
        <div className="flex items-center gap-2">
          <Switch
            checked={autosaveEnabled}
            disabled={isLoading || isPending}
            id="forms-autosave"
            onCheckedChange={setAutosaveEnabled}
          />
          <Label className="font-normal text-sm" htmlFor="forms-autosave">
            {t('forms_autosave')}
          </Label>
        </div>
      </SettingItemTab>
    </div>
  );
}
