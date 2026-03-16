'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useUserBooleanConfig } from '@/hooks/use-user-config';

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
        title={t('forms_autosave')}
        description={t('forms_autosave_description')}
      >
        <div className="flex items-center gap-2">
          <Switch
            id="forms-autosave"
            checked={autosaveEnabled}
            onCheckedChange={setAutosaveEnabled}
            disabled={isLoading || isPending}
          />
          <Label htmlFor="forms-autosave" className="font-normal text-sm">
            {t('forms_autosave')}
          </Label>
        </div>
      </SettingItemTab>
    </div>
  );
}
