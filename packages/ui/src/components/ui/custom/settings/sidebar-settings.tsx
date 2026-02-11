'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

interface SidebarSettingsProps {
  useSidebar: () => {
    behavior: 'expanded' | 'collapsed' | 'hover';
    handleBehaviorChange: (
      behavior: 'expanded' | 'collapsed' | 'hover'
    ) => void;
    localOverride: boolean;
    setLocalOverride: (value: boolean) => void;
  };
}

export default function SidebarSettings({ useSidebar }: SidebarSettingsProps) {
  const t = useTranslations();
  const { behavior, handleBehaviorChange, localOverride, setLocalOverride } =
    useSidebar();

  const [hideExperimental, setHideExperimental] = useLocalStorage(
    'sidebar-hide-experimental',
    false
  );

  const {
    value: expandSettingsAccordions,
    setValue: setExpandSettingsAccordions,
    isLoading: isLoadingExpandAccordions,
  } = useUserBooleanConfig('EXPAND_SETTINGS_ACCORDIONS', false);

  return (
    <div className="space-y-8">
      <SettingItemTab
        title={t('settings.preferences.sidebar_behavior')}
        description={t('settings.preferences.sidebar_behavior_description')}
      >
        <RadioGroup
          value={behavior}
          onValueChange={(value) =>
            handleBehaviorChange(value as 'expanded' | 'collapsed' | 'hover')
          }
          className="grid grid-cols-3 gap-4"
        >
          <div>
            <RadioGroupItem
              value="expanded"
              id="expanded"
              className="peer sr-only"
            />
            <Label
              htmlFor="expanded"
              className="flex cursor-pointer flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              {t('settings.preferences.sidebar_expanded')}
            </Label>
          </div>
          <div>
            <RadioGroupItem
              value="collapsed"
              id="collapsed"
              className="peer sr-only"
            />
            <Label
              htmlFor="collapsed"
              className="flex cursor-pointer flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              {t('settings.preferences.sidebar_collapsed')}
            </Label>
          </div>
          <div>
            <RadioGroupItem value="hover" id="hover" className="peer sr-only" />
            <Label
              htmlFor="hover"
              className="flex cursor-pointer flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              {t('settings.preferences.sidebar_hover')}
            </Label>
          </div>
        </RadioGroup>
      </SettingItemTab>

      <SettingItemTab
        title={t('settings.preferences.sidebar_local_override')}
        description={t(
          'settings.preferences.sidebar_local_override_description'
        )}
      >
        <div className="flex items-center space-x-2">
          <Switch checked={localOverride} onCheckedChange={setLocalOverride} />
        </div>
      </SettingItemTab>

      <Separator />

      <SettingItemTab
        title={t('settings.preferences.expand_settings_accordions')}
        description={t(
          'settings.preferences.expand_settings_accordions_description'
        )}
      >
        <div className="flex items-center space-x-2">
          <Switch
            checked={expandSettingsAccordions}
            onCheckedChange={setExpandSettingsAccordions}
            disabled={isLoadingExpandAccordions}
          />
        </div>
      </SettingItemTab>

      <Separator />

      <SettingItemTab
        title={t('settings-account.hide-experimental-on-sidebar')}
        description={t(
          'settings-account.hide-experimental-on-sidebar-description'
        )}
      >
        <div className="flex items-center space-x-2">
          <Switch
            checked={hideExperimental}
            onCheckedChange={setHideExperimental}
          />
        </div>
      </SettingItemTab>
    </div>
  );
}
