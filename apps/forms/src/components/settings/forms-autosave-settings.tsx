'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
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
      <SettingsSection>
        <SettingItemTab
          description={t('forms_autosave_description')}
          title={
            <Label className="font-medium" htmlFor="forms-autosave">
              {t('forms_autosave')}
            </Label>
          }
        >
          <Switch
            checked={autosaveEnabled}
            disabled={isLoading || isPending}
            id="forms-autosave"
            onCheckedChange={setAutosaveEnabled}
          />
        </SettingItemTab>
      </SettingsSection>
    </div>
  );
}
